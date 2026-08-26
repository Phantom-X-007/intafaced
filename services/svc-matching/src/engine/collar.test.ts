import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import {
  COLLAR_MISSING,
  COLLAR_OUTSIDE,
  collarIntentRefuse,
  missingCollarRefuse,
  outsideCollarRefuse,
  readCollar,
  readMax,
  readMin,
} from './collar.js';

/**
 * Price collar: caller min/max. Submit outside the band refuses.
 * Missing band when collar is requested refuses. No invented last or mid.
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
  collar?: boolean;
  min?: string | null;
  max?: string | null;
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
    ...(spec.collar !== undefined ? { collar: spec.collar } : {}),
    ...(spec.min !== undefined ? { min: spec.min == null ? null : A(spec.min) } : {}),
    ...(spec.max !== undefined ? { max: spec.max == null ? null : A(spec.max) } : {}),
  };
}

function liveIds(book: OrderBook): string[] {
  const state = book.toState();
  return [...state.bids.flatMap((l) => l.orders.map((o) => o.orderId)), ...state.asks.flatMap((l) => l.orders.map((o) => o.orderId))];
}

describe('price collar — caller min/max, never last or mid', () => {
  it('missing flags are a normal order — a smaller clip still fills', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: PLAIN, side: 'buy', qty: '10', price: '100' }));
    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
    expect(take.resting?.remaining).toBe(A('8'));
  });

  it('collar:false is a normal order — no invented band', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: PLAIN, side: 'buy', qty: '10', price: '100', collar: false }));
    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
  });

  it('collar:true without min/max refuses — last and mid on the book are not a band', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: LAST, account: 'mm', side: 'buy', qty: '1', price: '99' }));
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '101' }));
    const result = book.submit(order({ id: MISS, side: 'buy', qty: '10', price: '100', collar: true }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(COLLAR_MISSING);
    expect(result.fills).toHaveLength(0);
    expect(result.resting).toBeNull();
    expect(liveIds(book)).toEqual([LAST, ASK]);
  });

  it('collar:true with only min refuses — no invented max from last or mid', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const result = book.submit(order({ id: MISS, side: 'buy', qty: '10', price: '100', collar: true, min: '90' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(COLLAR_MISSING);
    expect(liveIds(book)).toEqual([ASK]);
  });

  it('collar:true with only max refuses — no invented min from last or mid', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: MISS, side: 'sell', qty: '10', price: '100', collar: true, max: '110' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(COLLAR_MISSING);
    expect(liveIds(book)).toEqual([]);
  });

  it('submit below min refuses — no rest', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '80' }));
    const result = book.submit(order({ id: MISS, side: 'buy', qty: '10', price: '80', collar: true, min: '90', max: '110' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(COLLAR_OUTSIDE);
    expect(result.fills).toHaveLength(0);
    expect(result.resting).toBeNull();
    expect(liveIds(book)).toEqual([ASK]);
  });

  it('submit above max refuses — no rest', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: MISS, side: 'sell', qty: '10', price: '120', collar: true, min: '90', max: '110' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(COLLAR_OUTSIDE);
    expect(liveIds(book)).toEqual([]);
  });

  it('submit on the band takes at the caller price', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '2', price: '100' }));
    const take = book.submit(order({ id: TAKE, side: 'buy', qty: '10', price: '100', collar: true, min: '90', max: '110' }));
    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
    expect(formatAmount(take.fills[0]!.price)).toBe('100');
  });

  it('submit at min and max edges is inside the band', () => {
    const book = new OrderBook('BTC/USDT');
    const lo = book.submit(order({ id: TAKE, side: 'buy', qty: '1', price: '90', collar: true, min: '90', max: '110' }));
    expect(lo.accepted).toBe(true);
    const hi = book.submit(order({ id: PLAIN, side: 'sell', qty: '1', price: '110', collar: true, min: '90', max: '110' }));
    expect(hi.accepted).toBe(true);
  });

  it('journal replay of a refused missing band does not invent a book', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const collared = order({ id: MISS, side: 'buy', qty: '10', price: '100', collar: true });
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T16:00:00.000Z', order: toWire(collared) });
    expect(new OrderBook(marketId).submit(collared).accepted).toBe(false);
    expect(replay(journal.read()).get(marketId)).toBeUndefined();
  });

  it('journal replay of a refused outside-band submit does not invent a book', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const collared = order({ id: TAKE, side: 'buy', qty: '10', price: '50', collar: true, min: '90', max: '110' });
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T16:00:00.000Z', order: toWire(collared) });
    expect(new OrderBook(marketId).submit(collared).accepted).toBe(false);
    expect(replay(journal.read()).get(marketId)).toBeUndefined();
  });

  it('read helpers treat missing and false as not set; execute needs both bounds', () => {
    expect(readCollar({})).toBe(false);
    expect(readCollar({ collar: null })).toBe(false);
    expect(readCollar({ collar: false })).toBe(false);
    expect(readCollar({ collar: true })).toBe(true);
    expect(readMin({})).toBeNull();
    expect(readMin({ min: null })).toBeNull();
    expect(readMin({ min: A('0') })).toBeNull();
    expect(readMin({ min: A('90') })).toBe(A('90'));
    expect(readMax({})).toBeNull();
    expect(readMax({ max: null })).toBeNull();
    expect(readMax({ max: A('0') })).toBeNull();
    expect(readMax({ max: A('110') })).toBe(A('110'));
    expect(missingCollarRefuse(null, A('110'))?.code).toBe(COLLAR_MISSING);
    expect(missingCollarRefuse(A('90'), null)?.code).toBe(COLLAR_MISSING);
    expect(missingCollarRefuse(A('90'), A('110'))).toBeNull();
    expect(outsideCollarRefuse(A('80'), A('90'), A('110'))?.code).toBe(COLLAR_OUTSIDE);
    expect(outsideCollarRefuse(A('120'), A('90'), A('110'))?.code).toBe(COLLAR_OUTSIDE);
    expect(outsideCollarRefuse(null, A('90'), A('110'))?.code).toBe(COLLAR_OUTSIDE);
    expect(outsideCollarRefuse(A('90'), A('90'), A('110'))).toBeNull();
    expect(outsideCollarRefuse(A('110'), A('90'), A('110'))).toBeNull();
    expect(collarIntentRefuse({ collar: true })?.code).toBe(COLLAR_MISSING);
    expect(collarIntentRefuse({ collar: true, min: A('90'), max: A('110'), price: A('80') })?.code).toBe(COLLAR_OUTSIDE);
    expect(collarIntentRefuse({ collar: true, min: A('90'), max: A('110'), price: A('100') })).toBeNull();
    expect(collarIntentRefuse({})).toBeNull();
  });
});
