import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import {
  AUCTION_UNSUPPORTED,
  BENCHMARK_UNSUPPORTED,
  auctionIntentRefuse,
  auctionRefuse,
  benchmarkRefuse,
  readAuction,
  readBenchmark,
} from './auction.js';

/**
 * Auction / benchmark refuse. The engine does not invent an auction price.
 * Missing or false is a normal order.
 */

const A = parseAmount;

const ASK = '11111111-1111-4111-8111-111111111111';
const TAKE = '33333333-3333-4333-8333-333333333333';
const MISS = '44444444-4444-4444-8444-444444444444';
const PLAIN = '55555555-5555-4555-8555-555555555555';

function order(spec: {
  id: string;
  account?: string;
  type?: EngineOrderType;
  side: OrderSide;
  qty: string;
  price?: string;
  tif?: TimeInForce;
  auction?: boolean;
  benchmark?: boolean;
}): EngineOrder {
  const type = spec.type ?? (spec.price === undefined ? 'market' : 'limit');
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type,
    side: spec.side,
    qty: A(spec.qty),
    price: spec.price === undefined ? null : A(spec.price),
    stopPrice: null,
    tif: spec.tif ?? 'GTC',
    ...(spec.auction !== undefined ? { auction: spec.auction } : {}),
    ...(spec.benchmark !== undefined ? { benchmark: spec.benchmark } : {}),
  };
}

function liveIds(book: OrderBook): string[] {
  const state = book.toState();
  return [...state.bids.flatMap((l) => l.orders.map((o) => o.orderId)), ...state.asks.flatMap((l) => l.orders.map((o) => o.orderId))];
}

describe('auction / benchmark — refuse, never a silent limit', () => {
  it('missing flags are a normal order — a smaller clip still fills', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: PLAIN, side: 'buy', qty: '10', price: '100' }));
    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
    expect(take.resting?.remaining).toBe(A('8'));
  });

  it('auction:false / benchmark:false is a normal order — no invented price', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: PLAIN, side: 'buy', qty: '10', price: '100', auction: false, benchmark: false }));
    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
  });

  it('auction:true refuses — no rest, no invented auction price', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const result = book.submit(order({ id: MISS, side: 'buy', qty: '10', price: '100', auction: true }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(AUCTION_UNSUPPORTED);
    expect(result.fills).toHaveLength(0);
    expect(result.resting).toBeNull();
    expect(liveIds(book)).toEqual([ASK]);
  });

  it('benchmark:true refuses — no rest, no invented benchmark price', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: MISS, side: 'sell', qty: '10', price: '100', benchmark: true }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(BENCHMARK_UNSUPPORTED);
    expect(result.fills).toHaveLength(0);
    expect(liveIds(book)).toEqual([]);
  });

  it('journal replay of a refused auction does not invent a book', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const auctioned = order({ id: MISS, side: 'buy', qty: '10', price: '100', auction: true });
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T16:00:00.000Z', order: toWire(auctioned) });
    expect(new OrderBook(marketId).submit(auctioned).accepted).toBe(false);
    expect(replay(journal.read()).get(marketId)).toBeUndefined();
  });

  it('journal replay of a refused benchmark does not invent a book', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const bench = order({ id: TAKE, side: 'buy', qty: '10', price: '100', benchmark: true });
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T16:00:00.000Z', order: toWire(bench) });
    expect(new OrderBook(marketId).submit(bench).accepted).toBe(false);
    expect(replay(journal.read()).get(marketId)).toBeUndefined();
  });

  it('read helpers treat missing and false as not set; true refuses', () => {
    expect(readAuction({})).toBe(false);
    expect(readAuction({ auction: null })).toBe(false);
    expect(readAuction({ auction: false })).toBe(false);
    expect(readAuction({ auction: true })).toBe(true);
    expect(readBenchmark({})).toBe(false);
    expect(readBenchmark({ benchmark: true })).toBe(true);
    expect(auctionRefuse(true)?.code).toBe(AUCTION_UNSUPPORTED);
    expect(auctionRefuse(false)).toBeNull();
    expect(benchmarkRefuse(true)?.code).toBe(BENCHMARK_UNSUPPORTED);
    expect(benchmarkRefuse(false)).toBeNull();
    expect(auctionIntentRefuse({ auction: true })?.code).toBe(AUCTION_UNSUPPORTED);
    expect(auctionIntentRefuse({ benchmark: true })?.code).toBe(BENCHMARK_UNSUPPORTED);
    expect(auctionIntentRefuse({})).toBeNull();
  });
});
