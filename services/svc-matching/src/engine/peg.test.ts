import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import {
  MIDPOINT_UNSUPPORTED,
  OFFSET_MISSING,
  REFERENCE_MISSING,
  bindPegRelative,
  midpointRefuse,
  offsetRefuse,
  pegIntentRefuse,
  pegPrice,
  readMidpoint,
  readOffset,
  readPeg,
  readReference,
  readRelative,
  referenceRefuse,
} from './peg.js';

/**
 * Peg / relative execute at caller reference + offset.
 * Missing those refuses. Midpoint stays unsupported. No invented mid.
 */

const A = parseAmount;

const ASK = '11111111-1111-4111-8111-111111111111';
const BID = '22222222-2222-4222-8222-222222222222';
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
  reference?: string | null;
  offset?: string | null;
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
    ...(spec.reference !== undefined ? { reference: spec.reference == null ? null : A(spec.reference) } : {}),
    ...(spec.offset !== undefined ? { offset: spec.offset == null ? null : A(spec.offset) } : {}),
  };
}

function liveIds(book: OrderBook): string[] {
  const state = book.toState();
  return [...state.bids.flatMap((l) => l.orders.map((o) => o.orderId)), ...state.asks.flatMap((l) => l.orders.map((o) => o.orderId))];
}

describe('peg / relative — execute at caller reference + offset', () => {
  it('missing flags are a normal order — a smaller clip still fills', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: PLAIN, side: 'buy', qty: '10', price: '100' }));
    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
    expect(take.resting?.remaining).toBe(A('8'));
  });

  it('peg:false / relative:false is a normal order — no invented reference', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: PLAIN, side: 'buy', qty: '10', price: '100', peg: false, relative: false }));
    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
  });

  it('peg:true without reference refuses — no rest, no invented mid', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: BID, account: 'mm', side: 'buy', qty: '1', price: '10' }));
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '90' }));
    const result = book.submit(order({ id: MISS, side: 'buy', qty: '10', price: '100', peg: true, offset: '1' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(REFERENCE_MISSING);
    expect(result.fills).toHaveLength(0);
    expect(result.resting).toBeNull();
    expect(liveIds(book)).toEqual([BID, ASK]);
  });

  it('peg:true without offset refuses — no rest, no invented mid', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: MISS, side: 'buy', qty: '10', peg: true, reference: '100' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(OFFSET_MISSING);
    expect(result.fills).toHaveLength(0);
    expect(liveIds(book)).toEqual([]);
  });

  it('relative:true without reference or offset refuses', () => {
    const book = new OrderBook('BTC/USDT');
    const missingRef = book.submit(order({ id: MISS, side: 'sell', qty: '10', relative: true, offset: '0' }));
    expect(missingRef.rejected?.code).toBe(REFERENCE_MISSING);
    const missingOff = book.submit(order({ id: TAKE, side: 'sell', qty: '10', relative: true, reference: '100' }));
    expect(missingOff.rejected?.code).toBe(OFFSET_MISSING);
  });

  it('midpoint:true refuses even with reference + offset — no invented mid', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: MISS, side: 'sell', qty: '10', price: '100', midpoint: true, reference: '100', offset: '0' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(MIDPOINT_UNSUPPORTED);
    expect(result.fills).toHaveLength(0);
    expect(liveIds(book)).toEqual([]);
  });

  it('peg:true with reference + offset takes at that price — not at the book mid', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: BID, account: 'mm', side: 'buy', qty: '1', price: '10' }));
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '101' }));
    const take = book.submit(order({ id: TAKE, side: 'buy', qty: '10', peg: true, reference: '100', offset: '1' }));
    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
    expect(formatAmount(take.fills[0]!.price)).toBe('101');
    expect(take.resting?.remaining).toBe(A('8'));
    expect(formatAmount(take.resting!.price)).toBe('101');
    expect(book.depth(50).bids.find((l) => l[0] === '50')).toBeUndefined();
    expect(book.depth(50).bids.find((l) => l[0] === '101')?.[1]).toBe('8');
  });

  it('relative:true with a negative offset rests at reference + offset, not the book mid', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: BID, account: 'mm', side: 'buy', qty: '1', price: '10' }));
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '190' }));
    const rest = book.submit(order({ id: TAKE, side: 'buy', qty: '3', relative: true, reference: '100', offset: '-1' }));
    expect(rest.accepted).toBe(true);
    expect(rest.fills).toHaveLength(0);
    expect(formatAmount(rest.resting!.price)).toBe('99');
    expect(book.depth(50).bids.map((l) => l[0])).toEqual(['99', '10']);
  });

  it('zero offset is supplied — price is the reference, not a mid', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(order({ id: TAKE, side: 'buy', qty: '3', peg: true, reference: '100', offset: '0' }));
    expect(rest.accepted).toBe(true);
    expect(formatAmount(rest.resting!.price)).toBe('100');
  });

  it('reference + offset that is not a positive price refuses — no invented mid', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: MISS, side: 'buy', qty: '1', peg: true, reference: '1', offset: '-1' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('invalid_price');
    expect(liveIds(book)).toEqual([]);
  });

  it('journal replay of an executed peg rebuilds the bound price', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const pegged = order({ id: TAKE, side: 'buy', qty: '10', peg: true, reference: '100', offset: '1' });
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T16:00:00.000Z', order: toWire(pegged) });
    expect(new OrderBook(marketId).submit(pegged).resting?.price).toBe(A('101'));
    const recovered = replay(journal.read()).get(marketId);
    expect(recovered?.toState().bids[0]?.price).toBe('101');
    expect(recovered?.toState().bids[0]?.orders[0]?.orderId).toBe(TAKE);
  });

  it('journal replay of a refused peg does not invent a book', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const pegged = order({ id: MISS, side: 'buy', qty: '10', price: '100', peg: true });
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T16:00:00.000Z', order: toWire(pegged) });
    expect(new OrderBook(marketId).submit(pegged).accepted).toBe(false);
    expect(replay(journal.read()).get(marketId)).toBeUndefined();
  });

  it('read helpers treat missing and false as not set; execute needs both numbers', () => {
    expect(readPeg({})).toBe(false);
    expect(readPeg({ peg: true })).toBe(true);
    expect(readRelative({ relative: true })).toBe(true);
    expect(readMidpoint({ midpoint: true })).toBe(true);
    expect(readReference({})).toBeNull();
    expect(readReference({ reference: null })).toBeNull();
    expect(readReference({ reference: A('0') })).toBeNull();
    expect(readReference({ reference: A('100') })).toBe(A('100'));
    expect(readOffset({})).toBeNull();
    expect(readOffset({ offset: null })).toBeNull();
    expect(readOffset({ offset: A('0') })).toBe(A('0'));
    expect(readOffset({ offset: A('-1') })).toBe(A('-1'));
    expect(referenceRefuse(null)?.code).toBe(REFERENCE_MISSING);
    expect(offsetRefuse(null)?.code).toBe(OFFSET_MISSING);
    expect(midpointRefuse(true)?.code).toBe(MIDPOINT_UNSUPPORTED);
    expect(pegIntentRefuse({ peg: true })?.code).toBe(REFERENCE_MISSING);
    expect(pegIntentRefuse({ peg: true, reference: A('100') })?.code).toBe(OFFSET_MISSING);
    expect(pegIntentRefuse({ peg: true, reference: A('100'), offset: A('1') })).toBeNull();
    expect(pegIntentRefuse({ relative: true, reference: A('100'), offset: A('0') })).toBeNull();
    expect(pegIntentRefuse({ midpoint: true, reference: A('100'), offset: A('0') })?.code).toBe(MIDPOINT_UNSUPPORTED);
    expect(pegPrice(A('100'), A('1'))).toBe(A('101'));
    expect(pegPrice(A('100'), A('-1'))).toBe(A('99'));
    expect(bindPegRelative(order({ id: TAKE, side: 'buy', qty: '1', peg: true, reference: '100', offset: '1' })).price).toBe(A('101'));
  });
});
