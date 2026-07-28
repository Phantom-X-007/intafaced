import { describe, expect, it } from 'vitest';
import {
  InsufficientFundsError,
  LedgerError,
  formatAmount,
  parseAmount as amt,
  userAvailable,
  orderHoldAccount,
} from '@intafaced/ledger-client';
import { serviceAuthHeaders } from '@intafaced/contracts';
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

describe('s2s HTTP — service credentials', () => {
  /** A minimal Fastify stand-in that records what got registered. */
  function fakeApp() {
    const routes = new Map<string, (req: unknown, reply: unknown) => Promise<unknown>>();
    return {
      routes,
      post(path: string, handler: (req: never, reply: never) => Promise<unknown>) {
        routes.set(path, handler as (req: unknown, reply: unknown) => Promise<unknown>);
      },
    };
  }

  function fakeReply() {
    const captured = { status: 200, body: undefined as unknown };
    const reply = {
      code(status: number) {
        captured.status = status;
        return reply;
      },
      send(body: unknown) {
        captured.body = body;
        return reply;
      },
    };
    return { reply, captured };
  }

  const SECRET = 'ledger-internal-service-secret-32ch!';

  async function callRoute(path: string, headers: Record<string, string>, body: unknown, service?: LedgerService) {
    const app = fakeApp();
    registerS2sHttp(app as never, service ?? stubService(), SECRET);
    const handler = app.routes.get(path)!;
    const { reply, captured } = fakeReply();
    const result = await handler({ headers, body } as never, reply as never);
    return { result, captured };
  }

  /**
   * THE ATTACK. A stranger reaching the port posts a balanced transaction
   * crediting a treasury boundary and debiting their own available balance —
   * the `deposit` recipe. Every ledger invariant is satisfied; it is simply not
   * authorised. This asserts the ledger was never asked, not merely that the
   * response was an error.
   */
  it('refuses an unauthenticated post, and never reaches the ledger', async () => {
    let posted = false;
    const service = stubService({
      post: async () => {
        posted = true;
        return { id: 'tx-1', hash: 'h', postedAt: new Date() };
      },
    });

    const { captured } = await callRoute('/trpc/post', { 'content-type': 'application/json' }, validPost, service);

    expect(captured.status).toBe(401);
    expect(posted).toBe(false);
  });

  it('refuses a forged signature', async () => {
    const { captured } = await callRoute(
      '/trpc/post',
      {
        'x-intafaced-service': 'svc-trade',
        'x-intafaced-service-ts': String(Math.floor(Date.now() / 1000)),
        'x-intafaced-service-sig': 'f'.repeat(64),
      },
      validPost,
    );

    expect(captured.status).toBe(401);
  });

  it('accepts a properly signed service call', async () => {
    const { result, captured } = await callRoute('/trpc/post', serviceAuthHeaders('svc-trade', SECRET), validPost);

    expect(captured.status).toBe(200);
    expect(result).toMatchObject({ txId: 'tx-s2s', hash: 'deadbeef' });
  });

  // Reads leak too. `balances` for a `treasury` or `house` owner is the
  // platform's own position; the tRPC twin restricts a user to their own
  // accounts and this route had no equivalent.
  it('refuses unauthenticated reads on every route, not just the write', async () => {
    for (const path of ['/trpc/balance', '/trpc/balances']) {
      const { captured } = await callRoute(path, {}, { ownerType: 'treasury', ownerId: 'rail:crypto-native' });
      expect(captured.status).toBe(401);
    }
  });

  it('maps an unauthenticated caller to 401, distinct from 412 frozen and 400 funds', () => {
    expect(httpError(new LedgerError('no creds', 'ledger.unauthenticated')).status).toBe(401);
    expect(httpError(new LedgerError('frozen', 'ledger.frozen')).status).toBe(412);
    expect(httpError(new InsufficientFundsError('a', 'USDT', '1', '0')).status).toBe(400);
  });
});
