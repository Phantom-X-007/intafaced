import { describe, expect, it, beforeEach } from 'vitest';
import { issueAccessToken, verifyAccessToken } from '@intafaced/auth';
import type { Context } from '@intafaced/contracts';
import {
  InsufficientFundsError,
  InvalidEntryError,
  LedgerError,
  UnbalancedTransactionError,
  formatAmount,
  parseAmount as amt,
  userAvailable,
} from '@intafaced/ledger-client';
import { createLedgerRouter } from './router.js';
import type { LedgerService } from './service.js';

/**
 * The tRPC surface.
 *
 * This file exists because the DoD gate said it should: `router.ts` reaches the
 * ledger and had no test, which the old "any test nearby counts" check hid.
 *
 * What it protects is error MAPPING and authorisation, not ledger maths — the
 * engine has its own conformance suite. A caller has to be able to tell
 * "you cannot afford this" from "the ledger is frozen" from "your service sent
 * a malformed transaction", because those three demand completely different
 * responses and two of them are not the user's fault.
 */

const authConfig = {
  secret: 'a-ledger-router-test-secret-long-enough',
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
};

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/**
 * `mfa` defaults false. Treasury scopes are in `INTERACTIVE_ONLY_SCOPES`, so
 * `requireScope` refuses them without a second factor — which is why the
 * operator tests below pass `mfa: true`. Discovered by writing this file: the
 * first draft omitted it and the freeze tests failed, correctly.
 */
async function ctx(scopes: string[], mfa = false, service: string | null = 'svc-trade'): Promise<Context> {
  if (scopes.length === 0) return { principal: null, service, region: 'DE', requestId: 'req-1' };
  const { token } = await issueAccessToken(
    { userId: USER, sessionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', scopes, tier: 'basic', mfa },
    authConfig,
  );
  return { principal: await verifyAccessToken(token, authConfig), service, region: 'DE', requestId: 'req-1' };
}

/**
 * A caller off the network with no credentials of any kind — no principal, no
 * service. This is what `post` used to accept.
 */
const anonymousCtx = (): Context => ({ principal: null, service: null, region: 'DE', requestId: 'req-anon' });

/** Minimal stand-in — the router only ever calls these five. */
function stubService(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    post: async () => ({ id: 'tx-1', hash: 'abc', postedAt: new Date('2026-07-27T00:00:00Z') }),
    balance: async () => ({ account: userAvailable(USER, 'USDT'), accountId: 'acct-1', amount: amt('100') }),
    balances: async () => [{ account: userAvailable(USER, 'USDT'), accountId: 'acct-1', amount: amt('100') }],
    reconcile: async () => ({ ok: true, balances: { ok: true, accountsChecked: 3 }, chain: { ok: true, length: 7 }, unbalancedAssets: [] }),
    freeze: async (reason: string, actor: string) => ({ frozen: true, reason, actor, changedAt: new Date('2026-07-27T00:00:00Z') }),
    unfreeze: async (actor: string) => ({ frozen: false, reason: null, actor, changedAt: new Date('2026-07-27T00:00:00Z') }),
    status: async () => ({ postingEnabled: true, frozenReason: null, frozenBy: null }),
    ...overrides,
  } as unknown as LedgerService;
}

const validPost = {
  idempotencyKey: 'router-test-key-1',
  module: 'trade',
  reason: 'trade.fill',
  entries: [
    { account: userAvailable(USER, 'USDT'), direction: 'debit' as const, amount: '100' },
    {
      account: { ownerType: 'treasury' as const, ownerId: 'rail:test', assetId: 'USDT', kind: 'available' as const },
      direction: 'credit' as const,
      amount: '100',
    },
  ],
};

describe('post — who may call it at all', () => {
  /**
   * THE ONE THAT MATTERS.
   *
   * `post` was a `publicProcedure`. Mounted, that let anyone reaching the port
   * post a balanced transaction crediting `railBoundary` — a `treasury`
   * account, the only owner type allowed to run negative — and debiting their
   * own `available`. That is the `deposit` recipe: sum-to-zero passes,
   * non-negative passes, paired locks pass. Well-formed, and unauthorised.
   *
   * Note the shape of this test: it does not check an error message, it checks
   * that the ledger was never asked to move anything.
   */
  it('refuses a caller with no service credentials, and moves nothing', async () => {
    let posted = false;
    const service = stubService({
      post: async () => {
        posted = true;
        return { id: 'tx-1', hash: 'abc', postedAt: new Date() };
      },
    });

    await expect(createLedgerRouter(service).createCaller(anonymousCtx()).post(validPost)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(posted).toBe(false);
  });

  it('is not satisfied by a USER token, however privileged', async () => {
    // A user principal is not a service. There is no `ledger:write` scope by
    // design, and `admin:treasury` with MFA still must not reach `post`.
    await expect(
      createLedgerRouter(stubService())
        .createCaller(await ctx(['admin:treasury'], true, null))
        .post(validPost),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('accepts an authenticated service caller', async () => {
    const caller = createLedgerRouter(stubService()).createCaller(await ctx([], false, 'svc-trade'));
    await expect(caller.post(validPost)).resolves.toMatchObject({ txId: 'tx-1', hash: 'abc' });
  });
});

describe('post — error mapping', () => {
  it('accepts a valid post and returns the transaction', async () => {
    const caller = createLedgerRouter(stubService()).createCaller(await ctx([]));
    await expect(caller.post(validPost)).resolves.toMatchObject({ txId: 'tx-1', hash: 'abc' });
  });

  it('maps insufficient funds to BAD_REQUEST — the caller can act on this', async () => {
    const service = stubService({
      post: async () => {
        throw new InsufficientFundsError('acct-1', 'USDT', '100', '10');
      },
    });
    await expect(
      createLedgerRouter(service)
        .createCaller(await ctx([]))
        .post(validPost),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('maps a frozen ledger to PRECONDITION_FAILED, not BAD_REQUEST', async () => {
    // Distinct on purpose: "you cannot afford this" is the user's problem and
    // permanent until they fund; "the ledger is frozen" is ours and temporary.
    // Collapsing them would have every caller retrying the wrong one.
    const service = stubService({
      post: async () => {
        throw new LedgerError('Ledger posting is frozen: reconciliation mismatch', 'ledger.frozen');
      },
    });
    await expect(
      createLedgerRouter(service)
        .createCaller(await ctx([]))
        .post(validPost),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it('maps an unbalanced transaction to INTERNAL_SERVER_ERROR — that is a calling-service bug', async () => {
    const service = stubService({
      post: async () => {
        throw new UnbalancedTransactionError({ USDT: '1' });
      },
    });
    await expect(
      createLedgerRouter(service)
        .createCaller(await ctx([]))
        .post(validPost),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('maps an invalid entry to INTERNAL_SERVER_ERROR for the same reason', async () => {
    const service = stubService({
      post: async () => {
        throw new InvalidEntryError('zero-amount entry');
      },
    });
    await expect(
      createLedgerRouter(service)
        .createCaller(await ctx([]))
        .post(validPost),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('rejects a malformed request before it reaches the ledger', async () => {
    const caller = createLedgerRouter(stubService()).createCaller(await ctx([]));

    // Single entry — value moving from nowhere.
    await expect(caller.post({ ...validPost, entries: [validPost.entries[0]!] })).rejects.toThrow();
    // Short idempotency key — a retry could not find the original.
    await expect(caller.post({ ...validPost, idempotencyKey: 'short' })).rejects.toThrow();
    // Float amount on the wire.
    await expect(
      caller.post({ ...validPost, entries: [{ ...validPost.entries[0]!, amount: '1.5e3' }, validPost.entries[1]!] }),
    ).rejects.toThrow();
  });
});

describe('balances — authorisation', () => {
  it('requires ledger:read', async () => {
    const caller = createLedgerRouter(stubService()).createCaller(await ctx(['trade:read']));
    await expect(caller.balance(userAvailable(USER, 'USDT'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('serves a scoped principal its own balance', async () => {
    const caller = createLedgerRouter(stubService()).createCaller(await ctx(['ledger:read']));
    await expect(caller.balance(userAvailable(USER, 'USDT'))).resolves.toMatchObject({ amount: '100' });
  });

  it('refuses to list another user’s balances, scope notwithstanding', async () => {
    // The scope says "may read balances", not "may read anyone's balances".
    const caller = createLedgerRouter(stubService()).createCaller(await ctx(['ledger:read']));
    await expect(caller.balances({ ownerType: 'user', ownerId: OTHER })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.balances({ ownerType: 'user', ownerId: USER })).resolves.toHaveLength(1);
  });

  it('rejects an anonymous caller', async () => {
    const caller = createLedgerRouter(stubService()).createCaller(await ctx([]));
    await expect(caller.balance(userAvailable(USER, 'USDT'))).rejects.toThrow(/Authentication required/);
  });
});

describe('operator controls', () => {
  let frozenWith: { reason: string; actor: string } | null;
  let service: LedgerService;

  beforeEach(() => {
    frozenWith = null;
    service = stubService({
      freeze: async (reason: string, actor: string) => {
        frozenWith = { reason, actor };
        return { frozen: true, reason, actor, changedAt: new Date('2026-07-27T00:00:00Z') };
      },
    });
  });

  it('requires admin:treasury to freeze', async () => {
    const caller = createLedgerRouter(service).createCaller(await ctx(['ledger:read', 'admin:read']));
    await expect(caller.freeze({ reason: 'testing' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(frozenWith).toBeNull();
  });

  it('refuses to freeze without a second factor, even with the scope', async () => {
    // §9: treasury actions are INTERACTIVE_ONLY. A stolen access token carrying
    // admin:treasury must not be able to halt the platform on its own.
    const caller = createLedgerRouter(service).createCaller(await ctx(['admin:treasury'], false));
    await expect(caller.freeze({ reason: 'testing' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(frozenWith).toBeNull();
  });

  it('freezes with the operator’s reason AND their identity recorded', async () => {
    // Who froze it is not decoration. An operator finding the platform halted
    // needs to know whether a human did it or reconciliation did.
    const caller = createLedgerRouter(service).createCaller(await ctx(['admin:treasury'], true));
    await expect(caller.freeze({ reason: 'suspected drift in USDT' })).resolves.toEqual({
      postingEnabled: false,
      frozenReason: 'suspected drift in USDT',
      frozenBy: USER,
    });
    expect(frozenWith).toEqual({ reason: 'suspected drift in USDT', actor: USER });
  });

  it('demands a non-empty reason — an unexplained freeze is unactionable', async () => {
    const caller = createLedgerRouter(service).createCaller(await ctx(['admin:treasury'], true));
    await expect(caller.freeze({ reason: '' })).rejects.toThrow();
  });

  it('gates reconcile behind admin:treasury and reports the run', async () => {
    const open = createLedgerRouter(stubService()).createCaller(await ctx(['admin:treasury'], true));
    await expect(open.reconcile()).resolves.toMatchObject({ ok: true, accountsChecked: 3, chainLength: 7 });

    const denied = createLedgerRouter(stubService()).createCaller(await ctx(['ledger:read']));
    await expect(denied.reconcile()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('on a broken chain reports length-so-far, never invents green zero', async () => {
    // The previous shape collapsed a failed chain to chainLength: 0. An empty
    // book and a book that broke at tx 5 are not the same fact.
    const open = createLedgerRouter(
      stubService({
        reconcile: async () => ({
          ok: false,
          ranAt: new Date('2026-08-09T00:00:00Z'),
          balances: { ok: true, accountsChecked: 2 },
          chain: { ok: false, brokenAt: 'tx-broken', length: 5 },
          totals: { USDT: '0' },
          unbalancedAssets: [],
        }),
      }),
    ).createCaller(await ctx(['admin:treasury'], true));

    await expect(open.reconcile()).resolves.toMatchObject({
      ok: false,
      accountsChecked: 2,
      chainLength: 5,
      chainBrokenAt: 'tx-broken',
      unbalancedAssets: [],
    });
  });
});

describe('health', () => {
  it('is open, and reports whether posting is enabled', async () => {
    const caller = createLedgerRouter(stubService()).createCaller(await ctx([]));
    await expect(caller.health()).resolves.toEqual({ ok: true, service: 'svc-ledger', postingEnabled: true });
  });

  it('reflects a frozen ledger', async () => {
    const service = stubService({ status: async () => ({ postingEnabled: false, frozenReason: 'drift', frozenBy: 'reconciliation' }) });
    const caller = createLedgerRouter(service).createCaller(await ctx([]));
    await expect(caller.health()).resolves.toMatchObject({ postingEnabled: false });
  });
});

describe('amounts cross the boundary as decimal strings', () => {
  it('never returns a number', async () => {
    const service = stubService({
      balance: async () => ({
        account: userAvailable(USER, 'USDT'),
        accountId: 'acct-1',
        amount: amt('1234.123456789012345678'),
      }),
    });
    const caller = createLedgerRouter(service).createCaller(await ctx(['ledger:read']));
    const result = await caller.balance(userAvailable(USER, 'USDT'));

    expect(typeof result.amount).toBe('string');
    // Full 18-decimal precision survives — a float would have lost it here.
    expect(result.amount).toBe('1234.123456789012345678');
    expect(formatAmount(amt(result.amount))).toBe('1234.123456789012345678');
  });
});
