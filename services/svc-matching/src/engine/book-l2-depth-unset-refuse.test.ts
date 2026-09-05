/**
 * Unit card — OrderBook.depth + hitch l2Depth unset refuse (no invented 50)
 *
 * 1. Promise: missing depth window throws (never invent 50). Owner-explicit 50
 *    is a published window.
 * 2. Break: `book.depth(limit = 50)` and hitch `l2Depth(..., n = 50)` still
 *    invented 50 after public GET /depth mill (#4058).
 * 3. Done bar: unset/null throw; 50 reads; book.ts has no `limit = 50`;
 *    l3-queue.ts has no `n = 50`.
 * 4. Class N
 * 5. Paths: book.ts depth(), l3-queue.ts l2Depth hitch
 * 6. RED: omitting limit returns a 50-level book
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MatchingEngine } from './engine.js';
import { OrderBook } from './book.js';
import { MemoryJournal } from './journal.js';
import { installL3Queue, type L2Depth } from './l3-queue.js';
import type { EngineOrder } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MARKET = 'BTC-USDT';

installL3Queue();

type L2Host = MatchingEngine & {
  l2Depth(marketId: string, n?: number | null): L2Depth;
};

function engine(): L2Host {
  return new MatchingEngine({
    journal: new MemoryJournal(),
    bus: new MemoryEventBus('svc-matching'),
    snapshotEvery: 0,
  }) as L2Host;
}

function rest(): EngineOrder {
  return {
    orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    accountId: 'desk',
    type: 'limit',
    side: 'buy',
    qty: parseAmount('1'),
    price: parseAmount('100'),
    stopPrice: null,
    tif: 'GTC',
  };
}

describe('OrderBook depth limit refuse-closed', () => {
  it('book.ts has no invented 50 on depth()', () => {
    const src = readFileSync(join(HERE, 'book.ts'), 'utf8');
    expect(src).not.toMatch(/depth\(limit = 50\)/);
    expect(src).toMatch(/publishedBookL2Limit/);
  });

  it('unset depth limit refuses (no invent 50)', () => {
    const book = new OrderBook(MARKET);
    expect(() => book.depth()).toThrow(/refuse to invent 50/);
    expect(() => book.depth(undefined)).toThrow(/refuse to invent 50/);
  });

  it('null depth limit refuses (no invent 50)', () => {
    const book = new OrderBook(MARKET);
    expect(() => book.depth(null)).toThrow(/refuse to invent 50/);
  });

  it('owner-explicit 50 is published (not invented)', () => {
    const book = new OrderBook(MARKET);
    expect(book.depth(50)).toEqual({ bids: [], asks: [], sequence: 0 });
  });
});

describe('hitch l2Depth n refuse-closed', () => {
  it('l3-queue.ts has no invented 50 on l2Depth()', () => {
    const src = readFileSync(join(HERE, 'l3-queue.ts'), 'utf8');
    expect(src).not.toMatch(/n = 50/);
    expect(src).toMatch(/publishedEngineL2Limit/);
  });

  it('unset l2Depth n refuses even when the market is empty', () => {
    const live = engine();
    expect(() => live.l2Depth(MARKET)).toThrow(/refuse to invent 50/);
    expect(() => live.l2Depth(MARKET, undefined)).toThrow(/refuse to invent 50/);
    expect(() => live.l2Depth(MARKET, null)).toThrow(/refuse to invent 50/);
  });

  it('owner-explicit 50 is published (not invented)', async () => {
    const live = engine();
    await live.submit(MARKET, rest());
    const l2 = live.l2Depth(MARKET, 50);
    expect(l2.level).toBe('L2');
    expect(l2.bids).toEqual([['100', '1']]);
  });
});
