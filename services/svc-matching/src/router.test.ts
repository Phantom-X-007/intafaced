import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeaders, serviceAuthHeadersForBody } from '@intafaced/contracts';
import { registerRoutes } from './router.js';

// ── Order writes are service-only ────────────────────────────────────────────
//
// These routes had no authentication at all. Two consequences, and the first is
// the one that matters:
//
//   · An order the ledger never held funds for could be submitted straight to
//     the engine. svc-trade's design note — "svc-matching is allowed to be pure
//     precisely because it never sees an unfunded order" — was enforced by
//     nothing but the absence of anyone trying.
//   · Any resting order could be cancelled by id. The engine publishes
//     `orderCancelled`, svc-trade releases that user's hold. A for-loop over
//     ids empties a book.
//
// Mounted on a REAL Fastify instance, because `registerRoutes` now installs a
// content-type parser to retain the raw bytes, and a digest is only worth
// something if the bytes it is checked against are the ones Fastify received.

describe('order writes require service credentials', () => {
  const SECRET = 'matching-internal-service-secret-32c';

  async function mount(engine: unknown, options?: { bodyBind?: 'accept-both' | 'require' }) {
    const app = Fastify({ logger: false });
    registerRoutes(app, engine as never, SECRET, options ?? {});
    await app.ready();
    return app;
  }

  const validSubmit = {
    orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    accountId: 'acct-1',
    type: 'limit' as const,
    side: 'buy' as const,
    qty: '1.5',
    price: '30000',
    tif: 'GTC' as const,
  };

  const submit = (app: FastifyInstance, headers: Record<string, string>, payload: string) =>
    app.inject({
      method: 'POST',
      url: '/markets/BTC-USDT/orders',
      headers: { 'content-type': 'application/json', ...headers },
      payload,
    });

  const cancel = (app: FastifyInstance, headers: Record<string, string>) =>
    app.inject({ method: 'DELETE', url: '/markets/m/orders/o', headers });

  it('refuses an unauthenticated submit, and the engine is never called', async () => {
    let submitted = false;
    const app = await mount({ submit: async () => ((submitted = true), { accepted: true }), markets: [] });

    const res = await submit(app, {}, JSON.stringify(validSubmit));

    expect(res.statusCode).toBe(401);
    expect(submitted).toBe(false);
    await app.close();
  });

  it('refuses an unauthenticated cancel, and the engine is never called', async () => {
    let cancelled = false;
    const app = await mount({ cancel: async () => ((cancelled = true), { cancelled: true }), markets: [] });

    const res = await cancel(app, {});

    expect(res.statusCode).toBe(401);
    expect(cancelled).toBe(false);
    await app.close();
  });

  it('refuses a forged signature', async () => {
    const app = await mount({ cancel: async () => ({ cancelled: true }), markets: [] });

    const res = await cancel(app, {
      'x-intafaced-service': 'svc-trade',
      'x-intafaced-service-ts': String(Math.floor(Date.now() / 1000)),
      'x-intafaced-service-sig': 'a'.repeat(64),
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('accepts a properly signed submit that binds its body', async () => {
    let submitted: unknown = null;
    const app = await mount({
      submit: async (_m: string, o: unknown) => {
        submitted = o;
        return { accepted: true, sequence: 1, fills: [], resting: null, cancellations: [], triggered: [] };
      },
      markets: [],
    });

    const payload = JSON.stringify(validSubmit);
    const res = await submit(app, serviceAuthHeadersForBody('svc-trade', SECRET, payload), payload);

    expect(res.statusCode).toBe(200);
    expect(submitted).not.toBeNull();
    await app.close();
  });

  /**
   * A bodyless request still binds — as the digest of the empty body. So the
   * cancel route cannot have a body bolted onto it, and its credentials cannot
   * be lifted onto the submit route.
   */
  it('accepts a properly signed cancel from svc-trade, binding the absent body', async () => {
    let cancelled = false;
    const app = await mount({
      cancel: async () => ((cancelled = true), { cancelled: true, orderId: 'o', sequence: 1, cancellation: null }),
      markets: [],
    });

    const res = await cancel(app, serviceAuthHeadersForBody('svc-trade', SECRET, ''));

    expect(res.statusCode).toBe(200);
    expect(cancelled).toBe(true);
    await app.close();
  });

  // ── L2-6: the replay this closes ───────────────────────────────────────────

  /**
   * THE TEST THE CHANGE EXISTS FOR, on the mounted path.
   *
   * svc-trade places the ledger hold and only then calls here, which is why the
   * engine is allowed to be pure. Credentials captured from one funded order,
   * replayed against a different one, broke that invariant from outside: the
   * engine would match an order svc-trade has no record of and no hold for.
   */
  it('refuses captured credentials replayed over a mutated order, and the engine is never called', async () => {
    let submitted = false;
    const app = await mount({
      submit: async () => ((submitted = true), { accepted: true, sequence: 1, fills: [], resting: null, cancellations: [], triggered: [] }),
      markets: [],
    });

    const honest = JSON.stringify(validSubmit);
    const headers = serviceAuthHeadersForBody('svc-trade', SECRET, honest);

    // Same credentials, 1000x the quantity.
    const tampered = JSON.stringify({ ...validSubmit, qty: '1500' });
    const res = await submit(app, headers, tampered);

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/body-mismatch/);
    expect(submitted).toBe(false);
    await app.close();
  });

  it('refuses cancel credentials lifted onto a submit', async () => {
    let submitted = false;
    const app = await mount({
      submit: async () => ((submitted = true), { accepted: true, sequence: 1, fills: [], resting: null, cancellations: [], triggered: [] }),
      markets: [],
    });

    // Minted for the bodyless cancel, pointed at the write that carries a body.
    const res = await submit(app, serviceAuthHeadersForBody('svc-trade', SECRET, ''), JSON.stringify(validSubmit));

    expect(res.statusCode).toBe(401);
    expect(submitted).toBe(false);
    await app.close();
  });

  // ── The migration, both directions ─────────────────────────────────────────

  it('accept-both admits a legacy v1 caller that has not been redeployed', async () => {
    const app = await mount(
      { cancel: async () => ({ cancelled: true, orderId: 'o', sequence: 1, cancellation: null }), markets: [] },
      { bodyBind: 'accept-both' },
    );

    const res = await cancel(app, serviceAuthHeaders('svc-trade', SECRET));

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('require refuses that same legacy caller, naming why', async () => {
    const app = await mount(
      { cancel: async () => ({ cancelled: true, orderId: 'o', sequence: 1, cancellation: null }), markets: [] },
      { bodyBind: 'require' },
    );

    const res = await cancel(app, serviceAuthHeaders('svc-trade', SECRET));

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/missing-body-digest/);
    await app.close();
  });

  it('require still admits a redeployed v2 caller — the destination state works', async () => {
    const app = await mount(
      { cancel: async () => ({ cancelled: true, orderId: 'o', sequence: 1, cancellation: null }), markets: [] },
      { bodyBind: 'require' },
    );

    const res = await cancel(app, serviceAuthHeadersForBody('svc-trade', SECRET, ''));

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  // Depth and the market list stay open. A price is not a secret, and market
  // data being public is the point of a public market.
  it('leaves market data readable without credentials', async () => {
    const app = await mount({ depth: () => ({ bids: [], asks: [], sequence: 0 }), markets: [] });

    const res = await app.inject({ method: 'GET', url: '/markets/m/depth' });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ── Reading must not create ──────────────────────────────────────────────────

describe('depth does not allocate a book', () => {
  /**
   * `engine.depth()` went through `engine.book()`, which creates and STORES an
   * OrderBook for any market id it is handed. The depth route is unauthenticated
   * by design — a price is not a secret — so `GET /markets/<anything>/depth` was
   * an unbounded memory-growth primitive against the engine, drivable from any
   * browser the moment a public websocket existed.
   *
   * Found while building svc-ws, which guards its own path by validating
   * against `GET /markets`. That guard protects one caller. This protects the
   * engine from every caller.
   */
  it('returns null for an unknown market instead of creating one', async () => {
    const { MatchingEngine } = await import('./engine/engine.js');
    const engine = new MatchingEngine({ journalPath: null } as never);

    expect(engine.depth('NOT-A-MARKET')).toBeNull();
    // The real assertion: the engine did not quietly grow.
    expect(engine.markets).not.toContain('NOT-A-MARKET');
  });

  it('does not grow the engine under repeated probing', async () => {
    const { MatchingEngine } = await import('./engine/engine.js');
    const engine = new MatchingEngine({ journalPath: null } as never);

    for (let i = 0; i < 500; i++) engine.depth(`PHANTOM-${i}`);

    expect(engine.markets).toHaveLength(0);
  });
});
