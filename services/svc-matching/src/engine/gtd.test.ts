import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';

/**
 * Rest a GTD/GTT. It expires on the engine clock.
 * Refuse if that clock is missing. No invented expiry.
 */

const A = parseAmount;

const GTD = '44444444-4444-4444-8444-444444444444';
const GTT = '55555555-5555-4555-8555-555555555555';
const LIQ = '11111111-1111-4111-8111-111111111111';
const TAKER = '66666666-6666-4666-8666-666666666666';

const EXPIRE = '2026-08-25T12:00:00.000Z';
const BEFORE = new Date('2026-08-25T11:00:00.000Z');
const AFTER = new Date('2026-08-25T12:00:00.000Z');

function order(spec: {
  id: string;
  account?: string;
  type?: EngineOrderType;
  side: OrderSide;
  qty: string;
  price?: string;
  tif?: TimeInForce;
  expireAt?: string;
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
    ...(spec.expireAt ? { expireAt: spec.expireAt } : {}),
  };
}

function liveIds(book: OrderBook): string[] {
  const state = book.toState();
  const ids = [
    ...state.bids.flatMap((l) => l.orders.map((o) => o.orderId)),
    ...state.asks.flatMap((l) => l.orders.map((o) => o.orderId)),
    ...state.stops.map((s) => s.orderId),
  ];
  return ids.sort();
}

describe('GTD/GTT — rest until the engine clock', () => {
  it('rests a GTD limit when expireAt is after the injected clock', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: GTD, side: 'buy', qty: '1', price: '100', tif: 'GTD', expireAt: EXPIRE }), BEFORE);

    expect(result.accepted).toBe(true);
    expect(result.resting?.kind).toBe('book');
    expect(formatAmount(result.resting!.remaining)).toBe('1');
    expect(book.toState().bids[0]!.orders[0]!.expireAt).toBe(EXPIRE);
    expect(liveIds(book)).toEqual([GTD]);
  });

  it('rests a GTT limit the same way — expireAt is the caller instant, not an invented EOD', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: GTT, side: 'sell', qty: '2', price: '101', tif: 'GTT', expireAt: EXPIRE }), BEFORE);

    expect(result.accepted).toBe(true);
    expect(result.resting?.kind).toBe('book');
    expect(book.toState().asks[0]!.orders[0]!.expireAt).toBe(EXPIRE);
  });

  it('refuses GTD when the engine clock is missing', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: GTD, side: 'buy', qty: '1', price: '100', tif: 'GTD', expireAt: EXPIRE }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('engine_clock_missing');
    expect(result.fills).toHaveLength(0);
    expect(book.currentSequence).toBe(0);
    expect(liveIds(book)).toEqual([]);
  });

  it('refuses GTT when expireAt is missing — the engine does not invent one', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: GTT, side: 'buy', qty: '1', price: '100', tif: 'GTT' }), BEFORE);

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('missing_expire_at');
    expect(book.currentSequence).toBe(0);
  });

  it('refuses when expireAt is not after the engine clock', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: GTD, side: 'buy', qty: '1', price: '100', tif: 'GTD', expireAt: EXPIRE }), AFTER);

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('already_expired');
    expect(book.currentSequence).toBe(0);
  });

  it('refuses a market GTD — it cannot rest', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: GTD, side: 'buy', qty: '1', tif: 'GTD', expireAt: EXPIRE }), BEFORE);

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('invalid_tif');
    expect(book.currentSequence).toBe(0);
  });

  it('a later clocked submit expires the resting GTD and reports expired so the hold can release', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: GTD, side: 'buy', qty: '1', price: '100', tif: 'GTD', expireAt: EXPIRE }), BEFORE);
    const later = book.submit(order({ id: TAKER, account: 'mm', side: 'buy', qty: '1', price: '99' }), AFTER);

    expect(later.accepted).toBe(true);
    expect(later.cancellations.map((c) => [c.orderId, c.reason])).toEqual([[GTD, 'expired']]);
    expect(liveIds(book)).toEqual([TAKER]);
  });

  it('GTC never grows an expireAt — no invented expiry on a book that is not GTD/GTT', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: LIQ, side: 'buy', qty: '1', price: '100' }));
    expect(book.toState().bids[0]!.orders[0]!.expireAt).toBeUndefined();
  });

  it('journal replay uses the journalled clock and expires when a later admission is due', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const live = new OrderBook(marketId);

    const gtd = order({ id: GTD, side: 'buy', qty: '1', price: '100', tif: 'GTD', expireAt: EXPIRE });
    const later = order({ id: TAKER, account: 'mm', side: 'buy', qty: '1', price: '99' });

    journal.append({ kind: 'submit', marketId, at: BEFORE.toISOString(), order: toWire(gtd) });
    live.submit(gtd, BEFORE);
    journal.append({ kind: 'submit', marketId, at: AFTER.toISOString(), order: toWire(later) });
    live.submit(later, AFTER);

    const restored = replay(journal.read()).get(marketId)!;
    expect(restored.serialize()).toBe(live.serialize());
    expect(liveIds(restored)).toEqual([TAKER]);
  });
});
