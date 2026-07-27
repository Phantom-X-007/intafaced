import { describe, expect, it } from 'vitest';
import {
  InsufficientFundsError,
  LedgerError,
  formatAmount,
  parseAmount as amt,
  userAvailable,
  orderHoldAccount,
} from '@intafaced/ledger-client';
import { handleS2sBalance, handleS2sPost, httpError } from './s2s-http.js';
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
