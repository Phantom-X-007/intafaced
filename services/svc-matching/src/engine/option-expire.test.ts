import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import { EXPIRY_MISSING } from './option.js';

/**
 * Expire a resting option at expiry. Unfilled remainder leaves the book.
 * Refuse if expiry is missing. No invented mark.
 */

const A = parseAmount;

const OPT = '11111111-1111-4111-8111-111111111111';
const MISS = '44444444-4444-4444-8444-444444444444';
const PLAIN = '55555555-5555-4555-8555-555555555555';
const TAKE = '22222222-2222-4222-8222-222222222222';
const EXPIRY = '2026-12-31T00:00:00.000Z';
const BEFORE = new Date('2026-06-01T00:00:00.000Z');
const AT = new Date('2026-12-31T00:00:00.000Z');
const AFTER = new Date('2027-01-01T00:00:00.000Z');

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
  };
}

describe('option — expire a rest at expiry', () => {
  it('unfilled remainder leaves the book at expiry', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }), BEFORE);
    expect(rest.accepted).toBe(true);
    expect(rest.resting).toMatchObject({ kind: 'book', orderId: OPT });
    expect(book.depth(50).bids).toEqual([['99', '2']]);

    const later = book.submit(order({ id: PLAIN, type: 'limit', side: 'sell', qty: '1', price: '101' }), AT);
    expect(later.accepted).toBe(true);
    expect(later.cancellations).toEqual(expect.arrayContaining([expect.objectContaining({ orderId: OPT, reason: 'expired' })]));
    expect(formatAmount(later.cancellations.find((row) => row.orderId === OPT)!.remainingQty)).toBe('2');
    expect(book.depth(50).bids).toEqual([]);
    expect(book.depth(50).asks).toEqual([['101', '1']]);
  });

  it('a rest already past expiry leaves immediately', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }), AFTER);
    expect(rest.accepted).toBe(true);
    expect(rest.resting).toBeNull();
    expect(rest.cancellations).toEqual(expect.arrayContaining([expect.objectContaining({ orderId: OPT, reason: 'expired' })]));
    expect(formatAmount(rest.cancellations.find((row) => row.orderId === OPT)!.remainingQty)).toBe('2');
    expect(book.depth(50).bids).toEqual([]);
  });

  it('partial take then expiry — remaining qty leaves', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: OPT, type: 'limit', side: 'sell', qty: '2', price: '99', strike: '100', expiry: EXPIRY }), BEFORE);
    const take = book.submit(order({ id: TAKE, type: 'limit', side: 'buy', qty: '1', price: '99', strike: '100', expiry: EXPIRY }), BEFORE);
    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(book.depth(50).asks).toEqual([['99', '1']]);

    const later = book.submit(order({ id: PLAIN, type: 'limit', side: 'buy', qty: '1', price: '90' }), AT);
    expect(later.cancellations).toEqual(expect.arrayContaining([expect.objectContaining({ orderId: OPT, reason: 'expired' })]));
    expect(formatAmount(later.cancellations.find((row) => row.orderId === OPT)!.remainingQty)).toBe('1');
    expect(book.depth(50).asks).toEqual([]);
  });

  it('refuses a missing expiry — no invented expiry from a mark', () => {
    const book = new OrderBook('BTC/USDT');
    for (const expiry of [null, '', '   '] as const) {
      const result = book.submit(
        order({
          id: MISS,
          type: 'limit',
          side: 'buy',
          qty: '2',
          price: '99',
          strike: '100',
          expiry,
          mark: '50',
        }),
        AFTER,
      );
      expect(result.accepted).toBe(false);
      expect(result.rejected?.code).toBe(EXPIRY_MISSING);
      expect(result.resting).toBeNull();
      expect(result.cancellations).toHaveLength(0);
    }
    expect(book.depth(50).bids).toEqual([]);
  });

  it('a supplied mark is not an expiry — rest stays until expiry', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(
      order({
        id: OPT,
        type: 'limit',
        side: 'buy',
        qty: '2',
        price: '99',
        strike: '100',
        expiry: EXPIRY,
        mark: '50',
      }),
      BEFORE,
    );
    expect(rest.accepted).toBe(true);
    expect(rest.resting).toMatchObject({ kind: 'book', orderId: OPT });
    expect(rest.cancellations).toHaveLength(0);
    expect(book.depth(50).bids).toEqual([['99', '2']]);
  });

  it('omitted now does not expire — the engine does not invent a clock', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }));
    expect(rest.accepted).toBe(true);
    expect(rest.resting).toMatchObject({ kind: 'book', orderId: OPT });
    const later = book.submit(order({ id: PLAIN, type: 'limit', side: 'sell', qty: '1', price: '101' }));
    expect(later.cancellations).toHaveLength(0);
    expect(book.depth(50).bids).toEqual([['99', '2']]);
  });
});
