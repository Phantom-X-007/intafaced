import { describe, expect, it, vi } from 'vitest';
import { parseAmount as amt, userAvailable } from '@intafaced/ledger-client';
import {
  INDEXER_ABSENT,
  PORTFOLIO_INDEXER_UNWIRED,
  composePortfolioView,
  portfolioViewFromLedgerBalances,
  portfolioViewSchema,
  resolveIndexerHalf,
} from './portfolio-view.js';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CHAIN = '0x1111111111111111111111111111111111111111';
const INDEXER = 'http://indexer.test';

function balances() {
  return [
    {
      account: userAvailable(USER, 'USDT'),
      accountId: 'acct-1',
      amount: amt('100'),
    },
  ];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('portfolioViewFromLedgerBalances — ops.portfolio', () => {
  it('names unwired indexer absent, never a zero chain balance', () => {
    const view = portfolioViewFromLedgerBalances({
      ownerType: 'user',
      ownerId: USER,
      balances: balances(),
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

  it('attaches present indexer positions as decimal strings when provided', () => {
    const view = portfolioViewFromLedgerBalances({
      ownerType: 'user',
      ownerId: USER,
      balances: balances(),
      indexer: {
        status: 'present',
        positions: [{ market: 'IFC-USD', size: '-2.5', entryPrice: '30000.5' }],
      },
    });

    expect(view.indexer).toEqual({
      status: 'present',
      positions: [{ market: 'IFC-USD', size: '-2.5', entryPrice: '30000.5' }],
    });
    if (view.indexer.status !== 'present') throw new Error('expected present');
    expect(typeof view.indexer.positions[0]!.size).toBe('string');
    expect(typeof view.indexer.positions[0]!.entryPrice).toBe('string');
    expect(portfolioViewSchema.parse(view).indexer).toEqual(view.indexer);
  });

  it('treats an empty present list as empty, not a zero holding', () => {
    const view = portfolioViewFromLedgerBalances({
      ownerType: 'user',
      ownerId: USER,
      balances: [],
      indexer: { status: 'present', positions: [] },
    });

    expect(view.indexer).toEqual({ status: 'present', positions: [] });
    expect(view.indexer).not.toHaveProperty('amount');
    expect(JSON.stringify(view.indexer)).not.toMatch(/"0"/);
  });

  it('refuses a JSON number as an indexer size — schema, not coercion', () => {
    expect(() =>
      portfolioViewSchema.parse({
        ownerType: 'user',
        ownerId: USER,
        custodial: [],
        indexer: { status: 'present', positions: [{ market: 'IFC-USD', size: 0, entryPrice: '1' }] },
      }),
    ).toThrow();
  });
});

describe('resolveIndexerHalf — HTTP/tRPC, never fabricated zeros', () => {
  it('stays named unwired when URL or 0x account is missing, and does not fetch', async () => {
    const fetch = vi.fn();
    expect(await resolveIndexerHalf({ fetch })).toEqual(INDEXER_ABSENT);
    expect(await resolveIndexerHalf({ url: INDEXER, fetch })).toEqual(INDEXER_ABSENT);
    expect(await resolveIndexerHalf({ url: INDEXER, chainAccount: USER, fetch })).toEqual(INDEXER_ABSENT);
    expect(await resolveIndexerHalf({ chainAccount: CHAIN, fetch })).toEqual(INDEXER_ABSENT);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns present positions as decimal strings from /trpc/positions', async () => {
    const fetch: typeof globalThis.fetch = async (input) => {
      expect(String(input)).toBe(`${INDEXER}/trpc/positions?input=${encodeURIComponent(JSON.stringify({ account: CHAIN }))}`);
      return jsonResponse({
        result: {
          data: [{ market: 'IFC-USD', account: CHAIN, size: '1.25', entryPrice: '99.5', blockHeight: 8, blockHash: '0xab' }],
        },
      });
    };

    const half = await resolveIndexerHalf({ url: INDEXER, chainAccount: CHAIN, fetch });
    expect(half).toEqual({
      status: 'present',
      positions: [{ market: 'IFC-USD', size: '1.25', entryPrice: '99.5' }],
    });
    if (half.status !== 'present') throw new Error('expected present');
    expect(typeof half.positions[0]!.size).toBe('string');
  });

  it('returns present empty when the indexer answers an empty list', async () => {
    const fetch = vi.fn(async () => jsonResponse({ result: { data: [] } }));
    expect(await resolveIndexerHalf({ url: INDEXER, chainAccount: CHAIN, fetch })).toEqual({
      status: 'present',
      positions: [],
    });
  });

  it('names unwired when the indexer is unreachable, halted, or sends JSON numbers', async () => {
    expect(
      await resolveIndexerHalf({
        url: INDEXER,
        chainAccount: CHAIN,
        fetch: async () => {
          throw new Error('ECONNREFUSED');
        },
      }),
    ).toEqual(INDEXER_ABSENT);

    expect(
      await resolveIndexerHalf({
        url: INDEXER,
        chainAccount: CHAIN,
        fetch: async () => jsonResponse({ error: { message: 'halted' } }, 503),
      }),
    ).toEqual(INDEXER_ABSENT);

    expect(
      await resolveIndexerHalf({
        url: INDEXER,
        chainAccount: CHAIN,
        fetch: async () =>
          jsonResponse({
            result: { data: [{ market: 'IFC-USD', size: 0, entryPrice: '1' }] },
          }),
      }),
    ).toEqual(INDEXER_ABSENT);
  });
});

describe('composePortfolioView', () => {
  it('fetches chain positions when URL and 0x account are usable', async () => {
    const view = await composePortfolioView({
      ownerType: 'user',
      ownerId: USER,
      balances: balances(),
      url: INDEXER,
      chainAccount: CHAIN,
      fetch: async () =>
        jsonResponse({
          result: { data: [{ market: 'IFC-USD', size: '3', entryPrice: '10' }] },
        }),
    });

    expect(view.indexer.status).toBe('present');
    expect(view.custodial[0]!.amount).toBe('100');
  });

  it('keeps a provided indexer half and does not fetch', async () => {
    const fetch = vi.fn();
    const view = await composePortfolioView({
      ownerType: 'user',
      ownerId: USER,
      balances: [],
      indexer: { status: 'present', positions: [] },
      url: INDEXER,
      chainAccount: CHAIN,
      fetch,
    });
    expect(view.indexer).toEqual({ status: 'present', positions: [] });
    expect(fetch).not.toHaveBeenCalled();
  });
});
