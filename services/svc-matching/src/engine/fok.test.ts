import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import { FOK_UNFILLABLE, fokRests, wholeOrNothing } from './fok.js';

/**
 * Rest an FOK. If it cannot fill completely, cancel the whole.
 * No partial leftover. No invented fill.
 */

const A = parseAmount;

const ASK = '11111111-1111-4111-8111-111111111111';
const FOK = '22222222-2222-4222-8222-222222222222';
const SHORT = '33333333-3333-4333-8333-333333333333';
const MISS = '44444444-4444-4444-8444-444444444444';
const IOC = '55555555-5555-4555-8555-555555555555';

function order(spec: {
  id: string;
  account?: string;
  type?: EngineOrderType;
  side: OrderSide;
  qty: string;
  price?: string;
  tif?: TimeInForce;
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

function askQty(book: OrderBook): string {
  const asks = book.toState().asks;
  return asks.flatMap((l) => l.orders.map((o) => o.remaining)).join(',') || '0';
}

describe('FOK — whole or nothing', () => {
  it('fills completely when the book has the full qty', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '3', price: '100' }));
    const result = book.submit(order({ id: FOK, side: 'buy', qty: '3', price: '100', tif: 'FOK' }));

    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(1);
    expect(formatAmount(result.fills[0]!.qty)).toBe('3');
    expect(result.resting).toBeNull();
    expect(result.rejected).toBeNull();
    expect(liveIds(book)).not.toContain(FOK);
    expect(liveIds(book)).not.toContain(ASK);
  });

  it('short book cancels the whole — no partial leftover, no invented fill', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    const before = book.serialize();
    const result = book.submit(order({ id: SHORT, side: 'buy', qty: '3', price: '100', tif: 'FOK' }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(FOK_UNFILLABLE);
    expect(result.fills).toHaveLength(0);
    expect(result.resting).toBeNull();
    expect(liveIds(book)).toEqual([ASK]);
    expect(askQty(book)).toBe('1');
    expect(book.serialize()).toBe(before);
  });

  it('empty book refuses — no invented fill', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: MISS, side: 'buy', qty: '1', price: '100', tif: 'FOK' }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(FOK_UNFILLABLE);
    expect(result.fills).toHaveLength(0);
    expect(result.resting).toBeNull();
    expect(liveIds(book)).toEqual([]);
  });

  it('IOC still takes a partial — FOK does not', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    const ioc = book.submit(order({ id: IOC, side: 'buy', qty: '3', price: '100', tif: 'IOC' }));
    expect(ioc.accepted).toBe(true);
    expect(ioc.fills).toHaveLength(1);
    expect(formatAmount(ioc.fills[0]!.qty)).toBe('1');
  });

  it('journal replay of a refused FOK does not invent a fill', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const live = new OrderBook(marketId);
    const ask = order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '100' });
    const fok = order({ id: SHORT, side: 'buy', qty: '3', price: '100', tif: 'FOK' });
    for (const o of [ask, fok]) {
      journal.append({ kind: 'submit', marketId, at: '2026-08-25T15:00:00.000Z', order: toWire(o) });
      live.submit(o);
    }
    const restored = replay(journal.read()).get(marketId)!;
    expect(restored.serialize()).toBe(live.serialize());
    expect(liveIds(restored)).toEqual([ASK]);
    expect(askQty(restored)).toBe('1');
  });

  it('wholeOrNothing is fok_unfillable when it cannot fill all', () => {
    expect(wholeOrNothing(false)).toBe(FOK_UNFILLABLE);
    expect(wholeOrNothing(true)).toBeNull();
    expect(fokRests('FOK')).toBe(false);
    expect(fokRests('GTC')).toBe(true);
  });
});
