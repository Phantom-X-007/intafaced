import { describe, expect, it } from 'vitest';
import { serviceAuthHeaders } from '@intafaced/contracts';
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

describe('order writes require service credentials', () => {
  const SECRET = 'matching-internal-service-secret-32c';

  function fakeApp() {
    const routes = new Map<string, (req: unknown, reply: unknown) => Promise<unknown>>();
    return {
      routes,
      post(path: string, h: (req: never, reply: never) => Promise<unknown>) {
        routes.set(`POST ${path}`, h as (req: unknown, reply: unknown) => Promise<unknown>);
      },
      delete(path: string, h: (req: never, reply: never) => Promise<unknown>) {
        routes.set(`DELETE ${path}`, h as (req: unknown, reply: unknown) => Promise<unknown>);
      },
      get(path: string, h: (req: never, reply: never) => Promise<unknown>) {
        routes.set(`GET ${path}`, h as (req: unknown, reply: unknown) => Promise<unknown>);
      },
    };
  }

  function fakeReply() {
    const captured = { status: 200, body: undefined as unknown };
    const reply = {
      code(s: number) {
        captured.status = s;
        return reply;
      },
      send(b: unknown) {
        captured.body = b;
        return reply;
      },
    };
    return { reply, captured };
  }

  function mount(engine: unknown) {
    const app = fakeApp();
    registerRoutes(app as never, engine as never, SECRET);
    return app;
  }

  it('refuses an unauthenticated submit, and the engine is never called', async () => {
    let submitted = false;
    const engine = { submit: async () => ((submitted = true), { accepted: true }), markets: [] };
    const app = mount(engine);
    const { reply, captured } = fakeReply();

    await app.routes.get('POST /markets/:marketId/orders')!(
      { headers: {}, params: { marketId: 'BTC-USDT' }, body: {} } as never,
      reply as never,
    );

    expect(captured.status).toBe(401);
    expect(submitted).toBe(false);
  });

  it('refuses an unauthenticated cancel, and the engine is never called', async () => {
    let cancelled = false;
    const engine = { cancel: async () => ((cancelled = true), { cancelled: true }), markets: [] };
    const app = mount(engine);
    const { reply, captured } = fakeReply();

    await app.routes.get('DELETE /markets/:marketId/orders/:orderId')!(
      { headers: {}, params: { marketId: 'BTC-USDT', orderId: 'someone-elses-order' } } as never,
      reply as never,
    );

    expect(captured.status).toBe(401);
    expect(cancelled).toBe(false);
  });

  it('refuses a forged signature', async () => {
    const app = mount({ cancel: async () => ({ cancelled: true }), markets: [] });
    const { reply, captured } = fakeReply();

    await app.routes.get('DELETE /markets/:marketId/orders/:orderId')!(
      {
        headers: {
          'x-intafaced-service': 'svc-trade',
          'x-intafaced-service-ts': String(Math.floor(Date.now() / 1000)),
          'x-intafaced-service-sig': 'a'.repeat(64),
        },
        params: { marketId: 'm', orderId: 'o' },
      } as never,
      reply as never,
    );

    expect(captured.status).toBe(401);
  });

  it('accepts a properly signed cancel from svc-trade', async () => {
    let cancelled = false;
    const engine = {
      cancel: async () => ((cancelled = true), { cancelled: true, orderId: 'o', sequence: 1, cancellation: null }),
      markets: [],
    };
    const app = mount(engine);
    const { reply } = fakeReply();

    await app.routes.get('DELETE /markets/:marketId/orders/:orderId')!(
      { headers: serviceAuthHeaders('svc-trade', SECRET), params: { marketId: 'm', orderId: 'o' } } as never,
      reply as never,
    );

    expect(cancelled).toBe(true);
  });

  // Depth and the market list stay open. A price is not a secret, and market
  // data being public is the point of a public market.
  it('leaves market data readable without credentials', async () => {
    const app = mount({ depth: () => ({ bids: [], asks: [], sequence: 0 }), markets: [] });
    const { reply, captured } = fakeReply();

    await app.routes.get('GET /markets/:marketId/depth')!({ headers: {}, params: { marketId: 'm' }, query: {} } as never, reply as never);

    expect(captured.status).toBe(200);
  });
});
