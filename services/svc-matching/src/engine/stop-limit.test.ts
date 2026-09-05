import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import { STOP_PX_MISSING, readStopPx, stopPxRefuse, waitsOffBook, wantsStopLimit } from './stop-limit.js';

/**
 * Rest a stop-limit. It does not live on the book until the stop prints.
 * No invented trigger.
 */

const A = parseAmount;

const SL = '11111111-1111-4111-8111-111111111111';
const MM = '22222222-2222-4222-8222-222222222222';
const TAKE = '33333333-3333-4333-8333-333333333333';
const MISS = '44444444-4444-4444-8444-444444444444';
const WARM = '55555555-5555-4555-8555-555555555555';

function order(spec: {
  id: string;
  account?: string;
  type?: EngineOrderType;
  side: OrderSide;
  qty: string;
  price?: string;
  stopPx?: string | null;
  tif?: TimeInForce;
}): EngineOrder {
  const type = spec.type ?? (spec.stopPx !== undefined || spec.price !== undefined ? 'stop_limit' : 'market');
  const stopPx = spec.stopPx === undefined ? null : spec.stopPx == null ? null : A(spec.stopPx);
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type,
    side: spec.side,
    qty: A(spec.qty),
    price: spec.price === undefined ? null : A(spec.price),
    stopPrice: stopPx,
    tif: spec.tif ?? 'GTC',
  };
}

describe('stop-limit — off-book until the stop prints', () => {
  it('does not live on the public book before any print', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: SL, type: 'stop_limit', side: 'buy', qty: '2', price: '106', stopPx: '105' }));

    expect(result.accepted).toBe(true);
    expect(result.resting).toMatchObject({ kind: 'stop', orderId: SL });
    expect(result.fills).toHaveLength(0);
    expect(book.depth(50).bids).toEqual([]);
    expect(book.depth(50).asks).toEqual([]);
    expect(book.toState().stops).toHaveLength(1);
    expect(book.toState().stops[0]!.stopPrice).toBe('105');
  });

  it('stays off the book until a print reaches stopPx', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: MM, account: 'mm', type: 'limit', side: 'sell', qty: '2', price: '100' }));
    book.submit(order({ id: WARM, account: 'warm', type: 'market', side: 'buy', qty: '2' }));
    book.submit(order({ id: TAKE, account: 'mm', type: 'limit', side: 'sell', qty: '10', price: '106' }));

    const parked = book.submit(order({ id: SL, type: 'stop_limit', side: 'buy', qty: '3', price: '106', stopPx: '105' }));
    expect(parked.resting?.kind).toBe('stop');
    expect(book.depth(50).bids).toEqual([]);

    const trigger = book.submit(order({ id: MISS, account: 'taker', type: 'market', side: 'buy', qty: '1' }));
    expect(trigger.triggered).toHaveLength(1);
    expect(trigger.triggered[0]!.orderId).toBe(SL);
    expect(formatAmount(trigger.triggered[0]!.fills[0]!.qty)).toBe('3');
    expect(book.toState().stops).toHaveLength(0);
  });

  it('a print that reaches stopPx rests leftover as a limit on the book', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: MM, account: 'mm', type: 'limit', side: 'sell', qty: '2', price: '100' }));
    book.submit(order({ id: WARM, account: 'warm', type: 'market', side: 'buy', qty: '2' }));
    book.submit(order({ id: TAKE, account: 'mm', type: 'limit', side: 'sell', qty: '10', price: '106' }));

    book.submit(order({ id: SL, type: 'stop_limit', side: 'buy', qty: '20', price: '106', stopPx: '105' }));
    const trigger = book.submit(order({ id: MISS, account: 'taker', type: 'market', side: 'buy', qty: '1' }));
    const outcome = trigger.triggered[0]!;

    expect(formatAmount(outcome.fills[0]!.qty)).toBe('9');
    expect(outcome.resting).toMatchObject({ kind: 'book', orderId: SL });
    expect(formatAmount(outcome.resting!.remaining)).toBe('11');
    expect(book.depth(50).bids).toEqual([['106', '11']]);
  });

  it('refuses a missing stopPx — no invented trigger', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: MISS, type: 'stop_limit', side: 'buy', qty: '2', price: '106', stopPx: null }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(STOP_PX_MISSING);
    expect(result.resting).toBeNull();
    expect(book.depth(50).bids).toEqual([]);
    expect(book.toState().stops).toHaveLength(0);
  });

  it('journal replay keeps an untriggered stop-limit off the public book', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const live = new OrderBook(marketId);
    const sl = order({ id: SL, type: 'stop_limit', side: 'buy', qty: '2', price: '106', stopPx: '105' });
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T15:00:00.000Z', order: toWire(sl) });
    live.submit(sl);
    const restored = replay(journal.read()).get(marketId)!;
    expect(restored.serialize()).toBe(live.serialize());
    expect(restored.depth(50).bids).toEqual([]);
    expect(restored.toState().stops[0]!.stopPrice).toBe('105');
  });

  it('helpers refuse a missing stopPx and wait off-book until the print', () => {
    expect(stopPxRefuse(null)?.code).toBe(STOP_PX_MISSING);
    expect(stopPxRefuse(A('0'))?.code).toBe(STOP_PX_MISSING);
    expect(stopPxRefuse(A('105'))).toBeNull();
    expect(wantsStopLimit({ type: 'stop_limit' })).toBe(true);
    expect(wantsStopLimit({ type: 'limit' })).toBe(false);
    expect(formatAmount(readStopPx({ stopPx: A('105') })!)).toBe('105');
    expect(waitsOffBook('buy', A('105'), null)).toBe(true);
    expect(waitsOffBook('buy', A('105'), A('100'))).toBe(true);
    expect(waitsOffBook('buy', A('105'), A('105'))).toBe(false);
    expect(waitsOffBook('sell', A('95'), A('100'))).toBe(true);
    expect(waitsOffBook('sell', A('95'), A('90'))).toBe(false);
  });
});
