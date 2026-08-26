import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import {
  NOTIONAL_BELOW,
  NOTIONAL_MISSING,
  belowMinNotionalRefuse,
  callerNotional,
  minNotionalIntentRefuse,
  missingNotionalRefuse,
  readMinNotional,
} from './min-notional.js';

/**
 * Caller min notional. Missing notional when requested refuses. No invented last.
 */

const A = parseAmount;

const ASK = '11111111-1111-4111-8111-111111111111';
const TAKE = '33333333-3333-4333-8333-333333333333';
const MISS = '44444444-4444-4444-8444-444444444444';
const PLAIN = '55555555-5555-4555-8555-555555555555';
const LAST = '66666666-6666-4666-8666-666666666666';

function order(spec: {
  id: string;
  account?: string;
  type?: EngineOrderType;
  side: OrderSide;
  qty: string;
  price?: string;
  tif?: TimeInForce;
  minNotional?: string | null;
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
    ...(spec.minNotional !== undefined ? { minNotional: spec.minNotional == null ? null : A(spec.minNotional) } : {}),
  };
}

function liveIds(book: OrderBook): string[] {
  const state = book.toState();
  return [...state.bids.flatMap((l) => l.orders.map((o) => o.orderId)), ...state.asks.flatMap((l) => l.orders.map((o) => o.orderId))];
}

describe('min notional — caller floor, never last', () => {
  it('missing minNotional is a normal order — a smaller clip still fills', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: PLAIN, side: 'buy', qty: '10', price: '100' }));
    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
    expect(take.resting?.remaining).toBe(A('8'));
  });

  it('minNotional zero is not requested — no invented floor', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: PLAIN, side: 'buy', qty: '10', price: '100', minNotional: '0' }));
    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
  });

  it('minNotional without a price refuses — last on the book is not a notional', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    book.submit(order({ id: LAST, side: 'buy', qty: '1', price: '100' }));
    expect(formatAmount(book.lastPrice!)).toBe('100');
    const result = book.submit(order({ id: MISS, side: 'buy', qty: '10', minNotional: '1000' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(NOTIONAL_MISSING);
    expect(result.fills).toHaveLength(0);
    expect(result.resting).toBeNull();
    expect(liveIds(book)).toEqual([ASK]);
    expect(formatAmount(book.lastPrice!)).toBe('100');
  });

  it('submit below the caller floor refuses — no rest', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const result = book.submit(order({ id: MISS, side: 'buy', qty: '9', price: '100', minNotional: '1000' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(NOTIONAL_BELOW);
    expect(result.fills).toHaveLength(0);
    expect(result.resting).toBeNull();
    expect(liveIds(book)).toEqual([ASK]);
  });

  it('submit at the caller floor takes at the caller price', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: TAKE, side: 'buy', qty: '10', price: '100', minNotional: '1000' }));
    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
    expect(formatAmount(take.fills[0]!.price)).toBe('100');
  });

  it('journal replay of a refused missing notional does not invent a book', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const incoming = order({ id: MISS, side: 'buy', qty: '10', minNotional: '1000' });
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T16:00:00.000Z', order: toWire(incoming) });
    expect(new OrderBook(marketId).submit(incoming).accepted).toBe(false);
    expect(replay(journal.read()).get(marketId)).toBeUndefined();
  });

  it('journal replay of a refused below-floor submit does not invent a book', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const incoming = order({ id: TAKE, side: 'buy', qty: '9', price: '100', minNotional: '1000' });
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T16:00:00.000Z', order: toWire(incoming) });
    expect(new OrderBook(marketId).submit(incoming).accepted).toBe(false);
    expect(replay(journal.read()).get(marketId)).toBeUndefined();
  });

  it('read helpers treat missing and zero as not set; execute needs a caller notional', () => {
    expect(readMinNotional({})).toBeNull();
    expect(readMinNotional({ minNotional: null })).toBeNull();
    expect(readMinNotional({ minNotional: A('0') })).toBeNull();
    expect(readMinNotional({ minNotional: A('1000') })).toBe(A('1000'));
    expect(callerNotional(A('10'), null)).toBeNull();
    expect(callerNotional(A('10'), A('100'))).toBe(A('1000'));
    expect(missingNotionalRefuse().code).toBe(NOTIONAL_MISSING);
    expect(belowMinNotionalRefuse().code).toBe(NOTIONAL_BELOW);
    expect(minNotionalIntentRefuse({ qty: A('10'), minNotional: A('1000') })?.code).toBe(NOTIONAL_MISSING);
    expect(minNotionalIntentRefuse({ qty: A('9'), price: A('100'), minNotional: A('1000') })?.code).toBe(NOTIONAL_BELOW);
    expect(minNotionalIntentRefuse({ qty: A('10'), price: A('100'), minNotional: A('1000') })).toBeNull();
    expect(minNotionalIntentRefuse({ qty: A('10'), price: A('100') })).toBeNull();
  });
});
