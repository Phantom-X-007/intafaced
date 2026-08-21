import { describe, expect, it } from 'vitest';
import { parseAmount as amt, userAvailable } from '@intafaced/ledger-client';
import { INDEXER_ABSENT, PORTFOLIO_INDEXER_UNWIRED, portfolioViewFromLedgerBalances, portfolioViewSchema } from './portfolio-view.js';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('portfolioViewFromLedgerBalances — ops.portfolio Stage-1', () => {
  it('names unwired indexer absent, never a zero chain balance', () => {
    const view = portfolioViewFromLedgerBalances({
      ownerType: 'user',
      ownerId: USER,
      balances: [
        {
          account: userAvailable(USER, 'USDT'),
          accountId: 'acct-1',
          amount: amt('100'),
        },
      ],
    });

    expect(view.indexer).toEqual({ status: 'absent', reason: PORTFOLIO_INDEXER_UNWIRED });
    expect(view.indexer).toEqual(INDEXER_ABSENT);
    expect(view.indexer).not.toHaveProperty('amount');
    expect(JSON.stringify(view.indexer)).not.toMatch(/"0"/);
    expect(view).not.toHaveProperty('onChain');
    expect(view).not.toHaveProperty('chain');
  });

  it('returns an empty custodial list when the book is empty — no invented volume', () => {
    const view = portfolioViewFromLedgerBalances({
      ownerType: 'user',
      ownerId: USER,
      balances: [],
    });

    expect(view.custodial).toEqual([]);
    expect(view.custodial).toHaveLength(0);
    expect(view.indexer.status).toBe('absent');
  });

  it('emits ledger amounts as decimal strings, never a float', () => {
    const view = portfolioViewFromLedgerBalances({
      ownerType: 'user',
      ownerId: USER,
      balances: [
        {
          account: userAvailable(USER, 'USDT'),
          accountId: 'acct-1',
          amount: amt('12.5'),
        },
      ],
    });

    expect(view.custodial).toEqual([
      {
        accountId: 'acct-1',
        assetId: 'USDT',
        kind: 'available',
        purpose: '',
        amount: '12.5',
      },
    ]);
    expect(typeof view.custodial[0]!.amount).toBe('string');
    expect(portfolioViewSchema.parse(view).custodial[0]!.amount).toBe('12.5');
  });
});
