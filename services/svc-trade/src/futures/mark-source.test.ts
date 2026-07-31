import { describe, expect, it } from 'vitest';
import { markSourceFromBook, memoryMarkBook, midFromBook, isFresh } from './mark-source.js';
import { runLiquidationTick, memoryLiquidationAttemptStore } from './liquidation-tick.js';
import { parseAmount as amt, type PostRequest } from '@intafaced/ledger-client';

describe('midFromBook', () => {
  it('returns mid of two-sided book', () => {
    expect(midFromBook('100', '102')).toBe('101');
  });

  it('returns null when a side is missing', () => {
    expect(midFromBook('100', null)).toBeNull();
    expect(midFromBook(null, '102')).toBeNull();
    expect(midFromBook('', '102')).toBeNull();
  });

  it('returns null when ask < bid (crossed)', () => {
    expect(midFromBook('102', '100')).toBeNull();
  });
});

describe('memoryMarkBook', () => {
  it('returns null when empty (never invents)', async () => {
    const book = memoryMarkBook({ now: () => 1_000_000 });
    const src = book.source();
    expect(await src.markPrice({ marketId: 'm1', at: new Date(1_000_000) })).toBeNull();
  });

  it('returns set mark when fresh and quality allowed', async () => {
    const book = memoryMarkBook({ now: () => 1_000_000 });
    book.set({
      marketId: 'm1',
      price: '50000',
      quality: 'index',
      asOfMs: 1_000_000,
    });
    const src = book.source({ maxAgeMs: 60_000 });
    expect(await src.markPrice({ marketId: 'm1', at: new Date(1_030_000) })).toBe('50000');
  });

  it('stale mark → null', async () => {
    const book = memoryMarkBook();
    book.set({
      marketId: 'm1',
      price: '50000',
      quality: 'mid',
      asOfMs: 0,
    });
    const src = book.source({ maxAgeMs: 1_000 });
    expect(await src.markPrice({ marketId: 'm1', at: new Date(10_000) })).toBeNull();
  });

  it('refuses last quality for liquidation by default', async () => {
    const book = memoryMarkBook({ now: () => 5_000 });
    book.set({
      marketId: 'm1',
      price: '50000',
      quality: 'last',
      asOfMs: 5_000,
    });
    const src = book.source();
    expect(await src.markPrice({ marketId: 'm1', at: new Date(5_000) })).toBeNull();
  });

  it('allows last when policy opts in', async () => {
    const book = memoryMarkBook({ now: () => 5_000 });
    book.set({
      marketId: 'm1',
      price: '50000',
      quality: 'last',
      asOfMs: 5_000,
    });
    const src = book.source({ liquidateOn: ['last', 'mid', 'index'] });
    expect(await src.markPrice({ marketId: 'm1', at: new Date(5_000) })).toBe('50000');
  });
});

describe('markSourceFromBook', () => {
  it('uses mid when two-sided', async () => {
    const src = markSourceFromBook({
      async readBook() {
        return { bestBid: '99', bestAsk: '101', last: '50' };
      },
    });
    expect(await src.markPrice({ marketId: 'm1', at: new Date() })).toBe('100');
  });

  it('empty book → null', async () => {
    const src = markSourceFromBook({
      async readBook() {
        return { bestBid: null, bestAsk: null, last: null };
      },
    });
    expect(await src.markPrice({ marketId: 'm1', at: new Date() })).toBeNull();
  });

  it('does not fall back to last unless policy allows', async () => {
    const src = markSourceFromBook({
      async readBook() {
        return { bestBid: null, bestAsk: null, last: '77' };
      },
    });
    expect(await src.markPrice({ marketId: 'm1', at: new Date() })).toBeNull();

    const srcLast = markSourceFromBook({
      async readBook() {
        return { bestBid: null, bestAsk: null, last: '77' };
      },
      policy: { liquidateOn: ['last'] },
    });
    expect(await srcLast.markPrice({ marketId: 'm1', at: new Date() })).toBe('77');
  });
});

describe('isFresh', () => {
  it('respects maxAgeMs', () => {
    const q = { marketId: 'm', price: '1', quality: 'mid' as const, asOfMs: 1000 };
    expect(isFresh(q, 1500, 1000)).toBe(true);
    expect(isFresh(q, 2500, 1000)).toBe(false);
    expect(isFresh(q, 9999, 0)).toBe(true);
  });
});

describe('integration: mark book → liquidation tick', () => {
  const USER = '11111111-1111-4111-8111-111111111111';

  it('does not liquidate when mark book empty', async () => {
    const book = memoryMarkBook({ now: () => 1_000_000 });
    const posts: PostRequest[] = [];
    const result = await runLiquidationTick({
      marks: book.source(),
      positions: {
        async listOpen() {
          return [
            {
              positionId: 'pos-1',
              userId: USER,
              side: 'long',
              size: amt('1'),
              entryPrice: amt('100'),
              margin: amt('10'),
              marginAsset: 'USDT',
              marketId: 'm1',
            },
          ];
        },
      },
      closer: {
        async markLiquidated() {
          throw new Error('no');
        },
      },
      attempts: memoryLiquidationAttemptStore(),
      ledger: {
        async post(req) {
          posts.push(req);
          return { id: 'x', idempotencyKey: req.idempotencyKey } as never;
        },
      },
      now: () => new Date(1_000_000),
    });
    expect(result.liquidated).toBe(0);
    expect(result.items[0]!.outcome).toBe('skipped_no_mark');
    expect(posts).toHaveLength(0);
  });

  it('liquidates when index mark is underwater', async () => {
    const book = memoryMarkBook({ now: () => 1_000_000 });
    book.set({
      marketId: 'm1',
      price: '80',
      quality: 'index',
      asOfMs: 1_000_000,
    });
    const posts: PostRequest[] = [];
    const closed: string[] = [];
    const result = await runLiquidationTick({
      marks: book.source(),
      positions: {
        async listOpen() {
          return [
            {
              positionId: 'pos-1',
              userId: USER,
              side: 'long',
              size: amt('1'),
              entryPrice: amt('100'),
              margin: amt('10'),
              marginAsset: 'USDT',
              marketId: 'm1',
            },
          ];
        },
      },
      closer: {
        async markLiquidated(id) {
          closed.push(id);
        },
      },
      attempts: memoryLiquidationAttemptStore(),
      ledger: {
        async post(req) {
          posts.push(req);
          return { id: 'x', idempotencyKey: req.idempotencyKey } as never;
        },
      },
      now: () => new Date(1_000_000),
      liquidationIdFor: () => 'liq-1',
    });
    expect(result.liquidated).toBe(1);
    expect(closed).toEqual(['pos-1']);
    expect(posts.length).toBeGreaterThan(0);
  });
});
