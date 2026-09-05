import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import { EXPIRY_DISAGREES, EXPIRY_MISSING, STRIKE_DISAGREES, STRIKE_MISSING } from './option.js';

/**
 * Cancel a resting option. Unfilled remainder leaves the book.
 * Refuse if strike or expiry is missing. No invented mark.
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
  cancel?: boolean;
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
    ...(spec.cancel === true ? { cancel: true } : {}),
  } as EngineOrder;
}

describe('option — cancel a rest', () => {
  it('unfilled remainder leaves the book', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }));
    expect(rest.accepted).toBe(true);
    expect(book.depth(50).bids).toEqual([['99', '2']]);

    const pulled = book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', strike: '100', expiry: EXPIRY, cancel: true }));
    expect(pulled.accepted).toBe(true);
    expect(pulled.resting).toBeNull();
    expect(pulled.fills).toHaveLength(0);
    expect(pulled.cancellations).toEqual(expect.arrayContaining([expect.objectContaining({ orderId: OPT, reason: 'requested' })]));
    expect(formatAmount(pulled.cancellations.find((row) => row.orderId === OPT)!.remainingQty)).toBe('2');
    expect(book.depth(50).bids).toEqual([]);
  });

  it('refuses a missing strike — still on the book, no invented mark', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }));
    const pulled = book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', expiry: EXPIRY, cancel: true, mark: '50' }));
    expect(pulled.accepted).toBe(false);
    expect(pulled.rejected?.code).toBe(STRIKE_MISSING);
    expect(pulled.cancellations).toHaveLength(0);
    expect(book.depth(50).bids).toEqual([['99', '2']]);
  });

  it('refuses a missing expiry — still on the book, no invented mark', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }));
    const pulled = book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', strike: '100', cancel: true, mark: '50' }));
    expect(pulled.accepted).toBe(false);
    expect(pulled.rejected?.code).toBe(EXPIRY_MISSING);
    expect(pulled.cancellations).toHaveLength(0);
    expect(book.depth(50).bids).toEqual([['99', '2']]);
  });

  it('a supplied mark is ignored — cancel still names strike and expiry', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }));
    const pulled = book.submit(
      order({
        id: OPT,
        type: 'limit',
        side: 'buy',
        qty: '2',
        strike: '100',
        expiry: EXPIRY,
        mark: '50',
        cancel: true,
      }),
    );
    expect(pulled.accepted).toBe(true);
    expect(pulled.cancellations).toEqual(expect.arrayContaining([expect.objectContaining({ orderId: OPT, reason: 'requested' })]));
    expect(book.depth(50).bids).toEqual([]);
  });

  it('refuses when strike disagrees — do not cancel a different contract', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }));
    const pulled = book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', strike: '105', expiry: EXPIRY, cancel: true }));
    expect(pulled.accepted).toBe(false);
    expect(pulled.rejected?.code).toBe(STRIKE_DISAGREES);
    expect(book.depth(50).bids).toEqual([['99', '2']]);
  });

  it('refuses when expiry disagrees — do not cancel a different contract', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }));
    const pulled = book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', strike: '100', expiry: OTHER, cancel: true }));
    expect(pulled.accepted).toBe(false);
    expect(pulled.rejected?.code).toBe(EXPIRY_DISAGREES);
    expect(book.depth(50).bids).toEqual([['99', '2']]);
  });

  it('refuses when nothing is resting — no invented cancel', () => {
    const book = new OrderBook('BTC/USDT');
    const pulled = book.submit(order({ id: MISS, type: 'limit', side: 'buy', qty: '2', strike: '100', expiry: EXPIRY, cancel: true }));
    expect(pulled.accepted).toBe(false);
    expect(pulled.rejected?.code).toBe('order_not_found');
    expect(pulled.cancellations).toHaveLength(0);
    expect(book.depth(50).bids).toEqual([]);
  });
});
