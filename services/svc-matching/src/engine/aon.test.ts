import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import { AON_ICEBERG, aonIcebergRefuse, canFillAon, clipMeetsAon, readAon } from './aon.js';
import { FOK_UNFILLABLE } from './fok.js';
import { IOC_REMAINDER } from './ioc.js';

/**
 * Rest an all-or-none. Fill the entire remaining qty or do not take a stub.
 * Missing or false is a normal order. No invented fill.
 */

const A = parseAmount;

const ASK = '11111111-1111-4111-8111-111111111111';
const ASK2 = '22222222-2222-4222-8222-222222222222';
const TAKE = '33333333-3333-4333-8333-333333333333';
const MISS = '44444444-4444-4444-8444-444444444444';
const PLAIN = '55555555-5555-4555-8555-555555555555';
const MAKER = '66666666-6666-4666-8666-666666666666';
const FOK = '77777777-7777-4777-8777-777777777777';
const IOC = '88888888-8888-4888-8888-888888888888';

function order(spec: {
  id: string;
  account?: string;
  type?: EngineOrderType;
  side: OrderSide;
  qty: string;
  price?: string;
  tif?: TimeInForce;
  aon?: boolean;
  iceberg?: boolean;
  displayQty?: string | null;
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
    ...(spec.aon !== undefined ? { aon: spec.aon } : {}),
    ...(spec.iceberg === true || spec.displayQty !== undefined
      ? { iceberg: true, displayQty: spec.displayQty == null ? null : A(spec.displayQty) }
      : {}),
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

describe('AON — whole remaining, or no trade', () => {
  it('missing aon is a normal order — a smaller clip still fills', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: PLAIN, side: 'buy', qty: '10', price: '100' }));

    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
    expect(formatAmount(take.resting!.remaining)).toBe('8');
  });

  it('aon:false is a normal order — no invented all-or-none', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: PLAIN, side: 'buy', qty: '10', price: '100', aon: false }));

    expect(take.accepted).toBe(true);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
  });

  it('short book does not take a stub — GTC rests the whole', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: TAKE, side: 'buy', qty: '10', price: '100', aon: true }));

    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(0);
    expect(formatAmount(take.resting!.remaining)).toBe('10');
    expect(book.toState().asks[0]!.orders[0]!.remaining).toBe('2');
    expect(book.toState().bids[0]!.orders[0]!.aon).toBe(true);
  });

  it('fills two clips that together cover remaining', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '5', price: '100' }));
    book.submit(order({ id: ASK2, account: 'mm-2', side: 'sell', qty: '5', price: '100' }));
    const take = book.submit(order({ id: TAKE, side: 'buy', qty: '10', price: '100', aon: true }));

    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(2);
    expect(take.fills.map((f) => formatAmount(f.qty))).toEqual(['5', '5']);
    expect(take.resting).toBeNull();
    expect(liveIds(book)).not.toContain(TAKE);
  });

  it('a resting AON does not fill below remaining', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: MAKER, account: 'mm', side: 'sell', qty: '10', price: '100', aon: true }));
    const crumb = book.submit(order({ id: TAKE, side: 'buy', qty: '4', price: '100' }));

    expect(crumb.fills).toHaveLength(0);
    expect(formatAmount(crumb.resting!.remaining)).toBe('4');
    expect(book.toState().asks[0]!.orders[0]!.remaining).toBe('10');
  });

  it('a resting AON fills when the clip exhausts remaining', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: MAKER, account: 'mm', side: 'sell', qty: '10', price: '100', aon: true }));
    const take = book.submit(order({ id: TAKE, side: 'buy', qty: '10', price: '100' }));

    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('10');
    expect(liveIds(book)).not.toContain(MAKER);
  });

  it('AON FOK that cannot fill all refuses — no rest, no stub', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    const result = book.submit(order({ id: FOK, side: 'buy', qty: '3', price: '100', tif: 'FOK', aon: true }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(FOK_UNFILLABLE);
    expect(result.fills).toHaveLength(0);
    expect(result.resting).toBeNull();
    expect(liveIds(book)).toEqual([ASK]);
  });

  it('AON IOC that cannot fill all cancels the whole — no stub fill', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    const result = book.submit(order({ id: IOC, side: 'buy', qty: '3', price: '100', tif: 'IOC', aon: true }));

    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(0);
    expect(result.resting).toBeNull();
    expect(result.cancellations[0]!.reason).toBe(IOC_REMAINDER);
    expect(formatAmount(result.cancellations[0]!.remainingQty)).toBe('3');
    expect(liveIds(book)).toEqual([ASK]);
  });

  it('iceberg plus AON refuses — unsupported, not a silent stub', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: MISS, side: 'sell', qty: '10', price: '100', aon: true, iceberg: true, displayQty: '2' }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(AON_ICEBERG);
    expect(result.fills).toHaveLength(0);
    expect(liveIds(book)).toEqual([]);
  });

  it('journal replay of a resting AON keeps the flag', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const live = new OrderBook(marketId);
    const rest = order({ id: TAKE, side: 'buy', qty: '10', price: '100', aon: true });
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T15:00:00.000Z', order: toWire(rest) });
    live.submit(rest);
    const restored = replay(journal.read()).get(marketId)!;
    expect(restored.serialize()).toBe(live.serialize());
    expect(restored.toState().bids[0]!.orders[0]!.aon).toBe(true);
  });

  it('readAon treats missing and false as not set; iceberg combo refuses', () => {
    expect(readAon({})).toBe(false);
    expect(readAon({ aon: null })).toBe(false);
    expect(readAon({ aon: false })).toBe(false);
    expect(readAon({ aon: true })).toBe(true);
    expect(aonIcebergRefuse(true, true)?.code).toBe(AON_ICEBERG);
    expect(aonIcebergRefuse(true, false)).toBeNull();
    expect(aonIcebergRefuse(false, true)).toBeNull();
    expect(clipMeetsAon(A('4'), A('10'), true)).toBe(false);
    expect(clipMeetsAon(A('10'), A('10'), true)).toBe(true);
    expect(clipMeetsAon(A('4'), A('10'), false)).toBe(true);
    expect(canFillAon(A('8'), A('10'), true)).toBe(false);
    expect(canFillAon(A('10'), A('10'), true)).toBe(true);
    expect(canFillAon(A('2'), A('10'), false)).toBe(true);
  });
});
