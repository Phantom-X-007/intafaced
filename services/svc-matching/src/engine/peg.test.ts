import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import {
  MIDPOINT_UNSUPPORTED,
  PEG_UNSUPPORTED,
  RELATIVE_UNSUPPORTED,
  midpointRefuse,
  pegIntentRefuse,
  pegRefuse,
  readMidpoint,
  readPeg,
  readRelative,
  relativeRefuse,
} from './peg.js';

/**
 * Peg / midpoint / relative refuse. The engine does not invent a mid.
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
  peg?: boolean;
  midpoint?: boolean;
  relative?: boolean;
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
    ...(spec.peg !== undefined ? { peg: spec.peg } : {}),
    ...(spec.midpoint !== undefined ? { midpoint: spec.midpoint } : {}),
    ...(spec.relative !== undefined ? { relative: spec.relative } : {}),
  };
}

function liveIds(book: OrderBook): string[] {
  const state = book.toState();
  return [...state.bids.flatMap((l) => l.orders.map((o) => o.orderId)), ...state.asks.flatMap((l) => l.orders.map((o) => o.orderId))];
}

describe('peg / midpoint / relative — refuse, never a silent limit', () => {
  it('missing flags are a normal order — a smaller clip still fills', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: PLAIN, side: 'buy', qty: '10', price: '100' }));
    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
    expect(take.resting?.remaining).toBe(A('8'));
  });

  it('peg:false / midpoint:false / relative:false is a normal order — no invented reference', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: PLAIN, side: 'buy', qty: '10', price: '100', peg: false, midpoint: false, relative: false }));
    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
  });

  it('peg:true refuses — no rest, no invented reference', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const result = book.submit(order({ id: MISS, side: 'buy', qty: '10', price: '100', peg: true }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(PEG_UNSUPPORTED);
    expect(result.fills).toHaveLength(0);
    expect(result.resting).toBeNull();
    expect(liveIds(book)).toEqual([ASK]);
  });

  it('midpoint:true refuses — no rest, no invented mid', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: MISS, side: 'sell', qty: '10', price: '100', midpoint: true }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(MIDPOINT_UNSUPPORTED);
    expect(result.fills).toHaveLength(0);
    expect(liveIds(book)).toEqual([]);
  });

  it('relative:true refuses — no rest, no invented reference', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: MISS, side: 'sell', qty: '10', price: '100', relative: true }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(RELATIVE_UNSUPPORTED);
    expect(result.fills).toHaveLength(0);
    expect(liveIds(book)).toEqual([]);
  });

  it('journal replay of a refused peg does not invent a book', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const pegged = order({ id: MISS, side: 'buy', qty: '10', price: '100', peg: true });
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T16:00:00.000Z', order: toWire(pegged) });
    expect(new OrderBook(marketId).submit(pegged).accepted).toBe(false);
    expect(replay(journal.read()).get(marketId)).toBeUndefined();
  });

  it('journal replay of a refused midpoint does not invent a book', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const mid = order({ id: TAKE, side: 'buy', qty: '10', price: '100', midpoint: true });
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T16:00:00.000Z', order: toWire(mid) });
    expect(new OrderBook(marketId).submit(mid).accepted).toBe(false);
    expect(replay(journal.read()).get(marketId)).toBeUndefined();
  });

  it('read helpers treat missing and false as not set; true refuses', () => {
    expect(readPeg({})).toBe(false);
    expect(readPeg({ peg: null })).toBe(false);
    expect(readPeg({ peg: false })).toBe(false);
    expect(readPeg({ peg: true })).toBe(true);
    expect(readMidpoint({})).toBe(false);
    expect(readMidpoint({ midpoint: true })).toBe(true);
    expect(readRelative({})).toBe(false);
    expect(readRelative({ relative: true })).toBe(true);
    expect(pegRefuse(true)?.code).toBe(PEG_UNSUPPORTED);
    expect(pegRefuse(false)).toBeNull();
    expect(midpointRefuse(true)?.code).toBe(MIDPOINT_UNSUPPORTED);
    expect(midpointRefuse(false)).toBeNull();
    expect(relativeRefuse(true)?.code).toBe(RELATIVE_UNSUPPORTED);
    expect(relativeRefuse(false)).toBeNull();
    expect(pegIntentRefuse({ peg: true })?.code).toBe(PEG_UNSUPPORTED);
    expect(pegIntentRefuse({ midpoint: true })?.code).toBe(MIDPOINT_UNSUPPORTED);
    expect(pegIntentRefuse({ relative: true })?.code).toBe(RELATIVE_UNSUPPORTED);
    expect(pegIntentRefuse({})).toBeNull();
  });
});
