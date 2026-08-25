import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import { IOC_REMAINDER, MARKET_REMAINDER, iocRests, remainderReason } from './ioc.js';

/**
 * Rest an IOC. Unfilled remainder cancels. No invented leftover.
 */

const A = parseAmount;

const ASK = '11111111-1111-4111-8111-111111111111';
const IOC = '22222222-2222-4222-8222-222222222222';
const MISS = '33333333-3333-4333-8333-333333333333';
const GTC = '44444444-4444-4444-8444-444444444444';
const MKT = '55555555-5555-4555-8555-555555555555';

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

describe('IOC — unfilled remainder cancels', () => {
  it('partial take cancels the leftover — no invented rest', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    const result = book.submit(order({ id: IOC, side: 'buy', qty: '3', price: '100', tif: 'IOC' }));

    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(1);
    expect(formatAmount(result.fills[0]!.qty)).toBe('1');
    expect(result.resting).toBeNull();
    expect(result.cancellations).toHaveLength(1);
    expect(result.cancellations[0]!.orderId).toBe(IOC);
    expect(result.cancellations[0]!.reason).toBe(IOC_REMAINDER);
    expect(formatAmount(result.cancellations[0]!.remainingQty)).toBe('2');
    expect(liveIds(book)).not.toContain(IOC);
  });

  it('a miss cancels the full qty — no leftover rest', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '101' }));
    const result = book.submit(order({ id: MISS, side: 'buy', qty: '1', price: '100', tif: 'IOC' }));

    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(0);
    expect(result.resting).toBeNull();
    expect(result.cancellations[0]!.reason).toBe(IOC_REMAINDER);
    expect(formatAmount(result.cancellations[0]!.remainingQty)).toBe('1');
    expect(liveIds(book)).toEqual([ASK]);
  });

  it('market IOC remainder is market_remainder — no invented leftover', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: MKT, side: 'buy', qty: '1', tif: 'IOC' }));

    expect(result.accepted).toBe(true);
    expect(result.resting).toBeNull();
    expect(result.cancellations[0]!.reason).toBe(MARKET_REMAINDER);
    expect(formatAmount(result.cancellations[0]!.remainingQty)).toBe('1');
    expect(liveIds(book)).toEqual([]);
  });

  it('GTC still rests leftover', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    const result = book.submit(order({ id: GTC, side: 'buy', qty: '3', price: '100', tif: 'GTC' }));

    expect(result.accepted).toBe(true);
    expect(result.resting?.kind).toBe('book');
    expect(formatAmount(result.resting!.remaining)).toBe('2');
    expect(result.cancellations.filter((c) => c.reason === IOC_REMAINDER)).toHaveLength(0);
    expect(liveIds(book)).toContain(GTC);
  });

  it('journal replay does not invent an IOC leftover', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const live = new OrderBook(marketId);
    const ask = order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '100' });
    const ioc = order({ id: IOC, side: 'buy', qty: '3', price: '100', tif: 'IOC' });
    for (const o of [ask, ioc]) {
      journal.append({ kind: 'submit', marketId, at: '2026-08-25T15:00:00.000Z', order: toWire(o) });
      live.submit(o);
    }
    const restored = replay(journal.read()).get(marketId)!;
    expect(restored.serialize()).toBe(live.serialize());
    expect(liveIds(restored)).not.toContain(IOC);
  });

  it('iocRests is false for IOC and FOK', () => {
    expect(iocRests('IOC')).toBe(false);
    expect(iocRests('FOK')).toBe(false);
    expect(iocRests('GTC')).toBe(true);
    expect(remainderReason(null)).toBe(MARKET_REMAINDER);
    expect(remainderReason('100')).toBe(IOC_REMAINDER);
  });
});
