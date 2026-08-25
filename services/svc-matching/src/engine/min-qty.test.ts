import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import { MIN_QTY_EXCEEDS, clipMeetsMinQty, minQtyRefuse, readMinQty } from './min-qty.js';

/**
 * Rest a min qty. A fill below the floor does not occur.
 * Missing or zero is not set. No invented default.
 */

const A = parseAmount;

const ASK = '11111111-1111-4111-8111-111111111111';
const ASK2 = '22222222-2222-4222-8222-222222222222';
const TAKE = '33333333-3333-4333-8333-333333333333';
const MISS = '44444444-4444-4444-8444-444444444444';
const PLAIN = '55555555-5555-4555-8555-555555555555';
const MAKER = '66666666-6666-4666-8666-666666666666';

function order(spec: {
  id: string;
  account?: string;
  type?: EngineOrderType;
  side: OrderSide;
  qty: string;
  price?: string;
  tif?: TimeInForce;
  minQty?: string | null;
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
    ...(spec.minQty !== undefined ? { minQty: spec.minQty == null ? null : A(spec.minQty) } : {}),
  };
}

function liveIds(book: OrderBook): string[] {
  const state = book.toState();
  return [
    ...state.bids.flatMap((l) => l.orders.map((o) => o.orderId)),
    ...state.asks.flatMap((l) => l.orders.map((o) => o.orderId)),
    ...state.stops.map((s) => s.orderId),
  ].sort();
}

describe('min qty — floor, not a silent stub', () => {
  it('missing minQty is not set — a smaller clip still fills', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: PLAIN, side: 'buy', qty: '10', price: '100' }));

    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
    expect(formatAmount(take.resting!.remaining)).toBe('8');
  });

  it('zero minQty is not set — no invented default', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: PLAIN, side: 'buy', qty: '10', price: '100', minQty: '0' }));

    expect(take.accepted).toBe(true);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
  });

  it('minQty above remaining refuses — no invented fill', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: MISS, side: 'buy', qty: '2', price: '100', minQty: '5' }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(MIN_QTY_EXCEEDS);
    expect(result.fills).toHaveLength(0);
    expect(liveIds(book)).toEqual([]);
  });

  it('a clip smaller than minQty does not occur — GTC rests the whole', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: TAKE, side: 'buy', qty: '10', price: '100', minQty: '5' }));

    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(0);
    expect(formatAmount(take.resting!.remaining)).toBe('10');
    expect(book.toState().asks[0]!.orders[0]!.remaining).toBe('2');
    expect(book.toState().bids[0]!.orders[0]!.minQty).toBe('5');
  });

  it('does not take a clip that would leave a stub below minQty', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '6', price: '100' }));
    const take = book.submit(order({ id: TAKE, side: 'buy', qty: '10', price: '100', minQty: '5' }));

    expect(take.fills).toHaveLength(0);
    expect(formatAmount(take.resting!.remaining)).toBe('10');
    expect(book.toState().asks[0]!.orders[0]!.remaining).toBe('6');
  });

  it('fills two clips each at the floor', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '5', price: '100' }));
    book.submit(order({ id: ASK2, account: 'mm-2', side: 'sell', qty: '5', price: '100' }));
    const take = book.submit(order({ id: TAKE, side: 'buy', qty: '10', price: '100', minQty: '5' }));

    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(2);
    expect(take.fills.map((f) => formatAmount(f.qty))).toEqual(['5', '5']);
    expect(take.resting).toBeNull();
    expect(liveIds(book)).not.toContain(TAKE);
  });

  it('a resting minQty does not fill below the floor', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: MAKER, account: 'mm', side: 'sell', qty: '10', price: '100', minQty: '5' }));
    const crumb = book.submit(order({ id: TAKE, side: 'buy', qty: '4', price: '100' }));

    expect(crumb.fills).toHaveLength(0);
    expect(formatAmount(crumb.resting!.remaining)).toBe('4');
    expect(book.toState().asks[0]!.orders[0]!.remaining).toBe('10');
  });

  it('a resting minQty fills when the clip meets the floor and leftover is not a stub', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: MAKER, account: 'mm', side: 'sell', qty: '10', price: '100', minQty: '5' }));
    const take = book.submit(order({ id: TAKE, side: 'buy', qty: '5', price: '100' }));

    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('5');
    expect(book.toState().asks[0]!.orders[0]!.remaining).toBe('5');
  });

  it('journal replay of a resting minQty keeps the floor', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const live = new OrderBook(marketId);
    const rest = order({ id: TAKE, side: 'buy', qty: '10', price: '100', minQty: '5' });
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T15:00:00.000Z', order: toWire(rest) });
    live.submit(rest);
    const restored = replay(journal.read()).get(marketId)!;
    expect(restored.serialize()).toBe(live.serialize());
    expect(restored.toState().bids[0]!.orders[0]!.minQty).toBe('5');
  });

  it('journal replay of a refused minQty does not invent a book', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const tooBig = order({ id: MISS, side: 'buy', qty: '2', price: '100', minQty: '5' });
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T15:00:00.000Z', order: toWire(tooBig) });
    expect(new OrderBook(marketId).submit(tooBig).accepted).toBe(false);
    expect(replay(journal.read()).get(marketId)).toBeUndefined();
  });

  it('readMinQty treats missing and zero as not set; minQtyRefuse fires above remaining', () => {
    expect(readMinQty({})).toBeNull();
    expect(readMinQty({ minQty: null })).toBeNull();
    expect(readMinQty({ minQty: A('0') })).toBeNull();
    expect(readMinQty({ minQty: A('5') })).toBe(A('5'));
    expect(minQtyRefuse(A('2'), A('5'))?.code).toBe(MIN_QTY_EXCEEDS);
    expect(minQtyRefuse(A('5'), A('5'))).toBeNull();
    expect(clipMeetsMinQty(A('2'), A('8'), A('5'))).toBe(false);
    expect(clipMeetsMinQty(A('6'), A('4'), A('5'))).toBe(false);
    expect(clipMeetsMinQty(A('5'), A('5'), A('5'))).toBe(true);
    expect(clipMeetsMinQty(A('10'), A('0'), A('5'))).toBe(true);
  });
});
