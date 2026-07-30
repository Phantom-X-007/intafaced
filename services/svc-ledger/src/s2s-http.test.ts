import { describe, expect, it } from 'vitest';
import {
  InsufficientFundsError,
  LedgerError,
  formatAmount,
  parseAmount as amt,
  userAvailable,
  orderHoldAccount,
} from '@intafaced/ledger-client';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeaders, serviceAuthHeadersForBody } from '@intafaced/contracts';
import { handleS2sBalance, handleS2sPost, httpError, registerS2sHttp } from './s2s-http.js';
import type { LedgerService } from './service.js';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function stubService(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    post: async () => ({ id: 'tx-s2s', hash: 'deadbeef', postedAt: new Date('2026-07-27T00:00:00Z') }),
    balance: async () => ({
      account: userAvailable(USER, 'USDT'),
      accountId: 'acct-1',
      amount: amt('42'),
    }),
    balances: async () => [],
    ...overrides,
  } as unknown as LedgerService;
}

const validPost = {
  idempotencyKey: 's2s-test-key',
  module: 'trade',
  reason: 'trade.fill',
  entries: [
    { account: userAvailable(USER, 'USDT'), direction: 'debit' as const, amount: '10' },
    {
      account: orderHoldAccount(USER, 'USDT', 'order:test'),
      direction: 'credit' as const,
      amount: '10',
    },
  ],
};

describe('s2s-http (graph W1-C money surface)', () => {
  it('posts and returns txId/hash/postedAt for service clients', async () => {
    const out = await handleS2sPost(stubService(), validPost);
    expect(out.txId).toBe('tx-s2s');
    expect(out.hash).toBe('deadbeef');
    expect(out.postedAt).toMatch(/^2026-07-27/);
  });

  it('maps insufficient funds to 400', () => {
    const mapped = httpError(new InsufficientFundsError(userAvailable(USER, 'USDT'), amt('1'), amt('0')));
    expect(mapped.status).toBe(400);
  });

  it('maps frozen ledger to 412', () => {
    const mapped = httpError(new LedgerError('frozen for test', 'ledger.frozen'));
    expect(mapped.status).toBe(412);
  });

  it('returns balance amounts as decimal strings', async () => {
    const out = await handleS2sBalance(stubService(), userAvailable(USER, 'USDT'));
    expect(out.amount).toBe(formatAmount(amt('42')));
    expect(out.accountId).toBe('acct-1');
  });
});

// ── Authentication on the surface that is actually served ────────────────────
//
// These tests exist because a previous revision of this change secured
// `createLedgerRouter`'s `post` procedure and stopped there. That router is
// built in `index.ts` and exported for its TYPE — nothing registers
// `fastifyTRPCPlugin`, so no guard on it is reachable from the port. The three
// routes below are what a caller actually hits.
//
// The lesson, written down: a guard is worth exactly as much as the route that
// runs it. Test the mounted path, not the one you edited.

//
// They now run against a REAL Fastify instance rather than a hand-rolled stand-in.
// That is not tidiness: `registerS2sHttp` installs a content-type parser to keep
// the raw request bytes, and body binding is only meaningful if the bytes being
// digested are the ones Fastify actually received. A fake `app` that records
// route handlers would verify a digest against a body the test handed it
// directly, which is the one thing that cannot go wrong in production.

describe('s2s HTTP — service credentials', () => {
  const SECRET = 'ledger-internal-service-secret-32ch!';

  async function mount(service?: LedgerService, options?: { bodyBind?: 'accept-both' | 'require' }) {
    const app = Fastify({ logger: false });
    registerS2sHttp(app, service ?? stubService(), SECRET, options ?? {});
    await app.ready();
    return app;
  }

  /** Post exactly `payload` — the same bytes the caller signed. */
  const send = (app: FastifyInstance, path: string, headers: Record<string, string>, payload: string) =>
    app.inject({ method: 'POST', url: path, headers: { 'content-type': 'application/json', ...headers }, payload });

  const wire = (body: unknown) => JSON.stringify(body);

  /**
   * THE ATTACK. A stranger reaching the port posts a balanced transaction
   * crediting a treasury boundary and debiting their own available balance —
   * the `deposit` recipe. Every ledger invariant is satisfied; it is simply not
   * authorised. This asserts the ledger was never asked, not merely that the
   * response was an error.
   */
  it('refuses an unauthenticated post, and never reaches the ledger', async () => {
    let posted = false;
    const app = await mount(
      stubService({
        post: async () => {
          posted = true;
          return { id: 'tx-1', hash: 'h', postedAt: new Date() };
        },
      }),
    );

    const res = await send(app, '/trpc/post', {}, wire(validPost));

    expect(res.statusCode).toBe(401);
    expect(posted).toBe(false);
    await app.close();
  });

  it('refuses a forged signature', async () => {
    const app = await mount();

    const res = await send(
      app,
      '/trpc/post',
      {
        'x-intafaced-service': 'svc-trade',
        'x-intafaced-service-ts': String(Math.floor(Date.now() / 1000)),
        'x-intafaced-service-sig': 'f'.repeat(64),
      },
      wire(validPost),
    );

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('accepts a properly signed service call that binds its body', async () => {
    const app = await mount();
    const payload = wire(validPost);

    const res = await send(app, '/trpc/post', serviceAuthHeadersForBody('svc-trade', SECRET, payload), payload);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ txId: 'tx-s2s', hash: 'deadbeef' });
    await app.close();
  });

  // ── L2-6: the replay this closes ───────────────────────────────────────────

  /**
   * THE TEST THE CHANGE EXISTS FOR, on the mounted path.
   *
   * Credentials captured from a legitimate 10-unit transfer, replayed byte for
   * byte against a 99999-unit one. Under the old scheme the signature covered
   * only `service` and a timestamp, so this succeeded for 300 seconds — and
   * `/trpc/post` reaches `ledger.post()` directly, which is what made a
   * replayable signature a replayable money instruction.
   */
  it('refuses captured credentials replayed over a mutated body, and never reaches the ledger', async () => {
    let posted = false;
    const app = await mount(
      stubService({
        post: async () => {
          posted = true;
          return { id: 'tx-forged', hash: 'h', postedAt: new Date() };
        },
      }),
    );

    const honest = wire(validPost);
    const headers = serviceAuthHeadersForBody('svc-trade', SECRET, honest);

    const tampered = honest.replace(/"amount":"10"/g, '"amount":"99999"');
    expect(tampered).not.toBe(honest);

    const res = await send(app, '/trpc/post', headers, tampered);

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/body-mismatch/);
    // The assertion that matters: the ledger was never asked to post it.
    expect(posted).toBe(false);
    await app.close();
  });

  it('refuses a body altered by a single byte', async () => {
    const app = await mount();
    const honest = wire(validPost);
    const headers = serviceAuthHeadersForBody('svc-trade', SECRET, honest);

    // A trailing space. Semantically the same JSON, different bytes, and the
    // digest commits to bytes.
    const res = await send(app, '/trpc/post', headers, `${honest} `);

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('binds each route separately — a signature for one body does not travel to another', async () => {
    const app = await mount();
    const balanceBody = wire(userAvailable(USER, 'USDT'));
    const headers = serviceAuthHeadersForBody('svc-trade', SECRET, balanceBody);

    // Credentials minted for a harmless balance read, pointed at the write.
    const res = await send(app, '/trpc/post', headers, wire(validPost));

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  // ── The migration, both directions ─────────────────────────────────────────

  it('accept-both admits a legacy v1 caller that has not been redeployed', async () => {
    const app = await mount(undefined, { bodyBind: 'accept-both' });
    const payload = wire(validPost);

    // No body digest — the old client, still in the fleet.
    const res = await send(app, '/trpc/post', serviceAuthHeaders('svc-trade', SECRET), payload);

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('require refuses that same legacy caller, naming why', async () => {
    const app = await mount(undefined, { bodyBind: 'require' });

    const res = await send(app, '/trpc/post', serviceAuthHeaders('svc-trade', SECRET), wire(validPost));

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/missing-body-digest/);
    await app.close();
  });

  it('require still admits a redeployed v2 caller — the destination state works', async () => {
    const app = await mount(undefined, { bodyBind: 'require' });
    const payload = wire(validPost);

    const res = await send(app, '/trpc/post', serviceAuthHeadersForBody('svc-trade', SECRET, payload), payload);

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  // Reads leak too. `balances` for a `treasury` or `house` owner is the
  // platform's own position; the tRPC twin restricts a user to their own
  // accounts and this route had no equivalent.
  it('refuses unauthenticated reads on every route, not just the write', async () => {
    const app = await mount();

    for (const path of ['/trpc/balance', '/trpc/balances']) {
      const res = await send(app, path, {}, wire({ ownerType: 'treasury', ownerId: 'rail:crypto-native' }));
      expect(res.statusCode).toBe(401);
    }
    await app.close();
  });

  // ── The parser this change swapped in must not have changed anything else ──

  it('still answers 400 for malformed JSON, with Fastify’s own code', async () => {
    const app = await mount();
    const payload = '{not json';

    const res = await send(app, '/trpc/post', serviceAuthHeadersForBody('svc-trade', SECRET, payload), payload);

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('FST_ERR_CTP_INVALID_JSON_BODY');
    await app.close();
  });

  it('still answers 400 for an empty JSON body', async () => {
    const app = await mount();

    const res = await send(app, '/trpc/post', serviceAuthHeadersForBody('svc-trade', SECRET, ''), '');

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('FST_ERR_CTP_EMPTY_JSON_BODY');
    await app.close();
  });

  it('maps an unauthenticated caller to 401, distinct from 412 frozen and 400 funds', () => {
    expect(httpError(new LedgerError('no creds', 'ledger.unauthenticated')).status).toBe(401);
    expect(httpError(new LedgerError('frozen', 'ledger.frozen')).status).toBe(412);
    expect(httpError(new InsufficientFundsError('a', 'USDT', '1', '0')).status).toBe(400);
  });
});
