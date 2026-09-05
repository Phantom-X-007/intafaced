import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import type { EngineAmend, EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import { EXPIRY_DISAGREES, EXPIRY_MISSING, PRICE_MISSING, STRIKE_DISAGREES, STRIKE_MISSING } from './option.js';

/**
 * Amend price on a resting option.
 * Refuse if strike, expiry, or price is missing. No invented mark.
 */

const A = parseAmount;

const OPT = '11111111-1111-4111-8111-111111111111';
const MISS = '44444444-4444-4444-8444-444444444444';
const EXPIRY = '2026-12-31T00:00:00.000Z';
const OTHER = '2026-06-30T00:00:00.000Z';

function order(spec: {
  id: string;
  account?: string;
  type?: EngineOrderType;
  side: OrderSide;
  qty: string;
  price?: string;
  mark?: string | null;
  strike?: string | null;
  expiry?: string | null;
  tif?: TimeInForce;
}): EngineOrder {
  const type = spec.type ?? (spec.price !== undefined ? 'limit' : 'market');
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type,
    side: spec.side,
    qty: A(spec.qty),
    price: spec.price === undefined ? null : A(spec.price),
    stopPrice: null,
    tif: spec.tif ?? 'GTC',
    ...(spec.mark !== undefined ? { mark: spec.mark == null ? null : A(spec.mark) } : {}),
    ...(spec.strike !== undefined ? { strike: spec.strike == null ? null : A(spec.strike) } : {}),
    ...(spec.expiry !== undefined ? { expiry: spec.expiry } : {}),
  } as EngineOrder;
}

function patch(
  rest: { orderId: string; version: number },
  extra: {
    strike?: string | null;
    expiry?: string | null;
    price?: string | null;
    mark?: string | null;
  },
): EngineAmend {
  return {
    orderId: rest.orderId,
    expectedVersion: rest.version,
    ...(extra.price !== undefined ? { price: extra.price == null ? null : A(extra.price) } : {}),
    ...(extra.strike !== undefined ? { strike: extra.strike == null ? null : A(extra.strike) } : {}),
    ...(extra.expiry !== undefined ? { expiry: extra.expiry } : {}),
    ...(extra.mark !== undefined ? { mark: extra.mark == null ? null : A(extra.mark) } : {}),
  } as EngineAmend;
}

describe('option — amend price on a rest', () => {
  it('moves the rest to the new price — remainder stays, mark is not used', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }));
    expect(rest.accepted).toBe(true);
    expect(book.depth(50).bids).toEqual([['99', '2']]);

    const amended = book.amend(patch({ orderId: OPT, version: rest.resting!.version }, { strike: '100', expiry: EXPIRY, price: '101' }));
    expect(amended.accepted).toBe(true);
    expect(amended.rejected).toBeUndefined();
    expect(formatAmount(amended.resting!.price)).toBe('101');
    expect(formatAmount(amended.resting!.remaining)).toBe('2');
    expect(book.depth(50).bids).toEqual([['101', '2']]);
  });

  it('refuses a missing strike — still at the old price, no invented mark', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }));
    const amended = book.amend(patch({ orderId: OPT, version: rest.resting!.version }, { expiry: EXPIRY, price: '101' }));
    expect(amended.accepted).toBe(false);
    expect(amended.rejected?.code).toBe(STRIKE_MISSING);
    expect(book.depth(50).bids).toEqual([['99', '2']]);
  });

  it('refuses a missing expiry — still at the old price, no invented mark', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }));
    const amended = book.amend(patch({ orderId: OPT, version: rest.resting!.version }, { strike: '100', price: '101' }));
    expect(amended.accepted).toBe(false);
    expect(amended.rejected?.code).toBe(EXPIRY_MISSING);
    expect(book.depth(50).bids).toEqual([['99', '2']]);
  });

  it('refuses a missing price — still at the old price, no invented mark', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }));
    const amended = book.amend(patch({ orderId: OPT, version: rest.resting!.version }, { strike: '100', expiry: EXPIRY, price: null }));
    expect(amended.accepted).toBe(false);
    expect(amended.rejected?.code).toBe(PRICE_MISSING);
    expect(book.depth(50).bids).toEqual([['99', '2']]);
  });

  it('refuses a supplied mark — unsupported amend field, rest unchanged', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }));
    const amended = book.amend(
      patch({ orderId: OPT, version: rest.resting!.version }, { strike: '100', expiry: EXPIRY, price: '98', mark: '50' }),
    );
    expect(amended.accepted).toBe(false);
    expect(amended.rejected?.code).toBe('amend_field_unsupported');
    expect(amended.rejected?.message).toContain('mark');
    expect(book.depth(50).bids).toEqual([['99', '2']]);
  });

  it('refuses when strike disagrees — do not amend a different contract', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }));
    const amended = book.amend(patch({ orderId: OPT, version: rest.resting!.version }, { strike: '105', expiry: EXPIRY, price: '101' }));
    expect(amended.accepted).toBe(false);
    expect(amended.rejected?.code).toBe(STRIKE_DISAGREES);
    expect(book.depth(50).bids).toEqual([['99', '2']]);
  });

  it('refuses when expiry disagrees — do not amend a different contract', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }));
    const amended = book.amend(patch({ orderId: OPT, version: rest.resting!.version }, { strike: '100', expiry: OTHER, price: '101' }));
    expect(amended.accepted).toBe(false);
    expect(amended.rejected?.code).toBe(EXPIRY_DISAGREES);
    expect(book.depth(50).bids).toEqual([['99', '2']]);
  });

  it('refuses when nothing is resting — no invented amend', () => {
    const book = new OrderBook('BTC/USDT');
    const amended = book.amend(patch({ orderId: MISS, version: 1 }, { strike: '100', expiry: EXPIRY, price: '101' }));
    expect(amended.accepted).toBe(false);
    expect(amended.rejected?.code).toBe('order_not_found');
    expect(book.depth(50).bids).toEqual([]);
  });
});
