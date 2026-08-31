import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import type { EngineAmend, EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import { EXPIRY_DISAGREES, EXPIRY_MISSING, PRICE_MISSING, STRIKE_DISAGREES, STRIKE_MISSING } from './option.js';

/**
 * Replace a resting option — price and qty together.
 * Refuse if strike, expiry, price, or qty is missing. No invented mark.
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
    qty?: string | null;
    mark?: string | null;
    replace?: boolean;
  },
): EngineAmend {
  return {
    orderId: rest.orderId,
    expectedVersion: rest.version,
    ...(extra.replace === true ? { replace: true } : {}),
    ...(extra.qty !== undefined ? { qty: extra.qty == null ? null : A(extra.qty) } : {}),
    ...(extra.price !== undefined ? { price: extra.price == null ? null : A(extra.price) } : {}),
    ...(extra.strike !== undefined ? { strike: extra.strike == null ? null : A(extra.strike) } : {}),
    ...(extra.expiry !== undefined ? { expiry: extra.expiry } : {}),
    ...(extra.mark !== undefined ? { mark: extra.mark == null ? null : A(extra.mark) } : {}),
  } as EngineAmend;
}

describe('option — replace price and qty on a rest', () => {
  it('moves the rest to the new price and qty together — mark is not used', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(
      order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }),
    );
    expect(rest.accepted).toBe(true);
    expect(book.depth().bids).toEqual([['99', '2']]);

    const replaced = book.amend(
      patch(
        { orderId: OPT, version: rest.resting!.version },
        { replace: true, strike: '100', expiry: EXPIRY, price: '101', qty: '3', mark: '50' },
      ),
    );
    expect(replaced.accepted).toBe(true);
    expect(replaced.rejected).toBeUndefined();
    expect(formatAmount(replaced.resting!.price)).toBe('101');
    expect(formatAmount(replaced.resting!.remaining)).toBe('3');
    expect(book.depth().bids).toEqual([['101', '3']]);
  });

  it('refuses a missing strike — still at the old price and qty, no invented mark', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(
      order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }),
    );
    const replaced = book.amend(
      patch(
        { orderId: OPT, version: rest.resting!.version },
        { replace: true, expiry: EXPIRY, price: '101', qty: '3', mark: '50' },
      ),
    );
    expect(replaced.accepted).toBe(false);
    expect(replaced.rejected?.code).toBe(STRIKE_MISSING);
    expect(book.depth().bids).toEqual([['99', '2']]);
  });

  it('refuses a missing expiry — still at the old price and qty, no invented mark', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(
      order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }),
    );
    const replaced = book.amend(
      patch(
        { orderId: OPT, version: rest.resting!.version },
        { replace: true, strike: '100', price: '101', qty: '3', mark: '50' },
      ),
    );
    expect(replaced.accepted).toBe(false);
    expect(replaced.rejected?.code).toBe(EXPIRY_MISSING);
    expect(book.depth().bids).toEqual([['99', '2']]);
  });

  it('refuses a missing price — still at the old price and qty, no invented mark', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(
      order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }),
    );
    const replaced = book.amend(
      patch(
        { orderId: OPT, version: rest.resting!.version },
        { replace: true, strike: '100', expiry: EXPIRY, price: null, qty: '3', mark: '50' },
      ),
    );
    expect(replaced.accepted).toBe(false);
    expect(replaced.rejected?.code).toBe(PRICE_MISSING);
    expect(book.depth().bids).toEqual([['99', '2']]);
  });

  it('refuses a missing qty — still at the old price and qty, no invented mark', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(
      order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }),
    );
    const replaced = book.amend(
      patch(
        { orderId: OPT, version: rest.resting!.version },
        { replace: true, strike: '100', expiry: EXPIRY, price: '101', mark: '50' },
      ),
    );
    expect(replaced.accepted).toBe(false);
    expect(replaced.rejected?.code).toBe('invalid_qty');
    expect(book.depth().bids).toEqual([['99', '2']]);
  });

  it('a supplied mark is ignored — replace still names strike, expiry, price, and qty', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(
      order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }),
    );
    const replaced = book.amend(
      patch(
        { orderId: OPT, version: rest.resting!.version },
        { replace: true, strike: '100', expiry: EXPIRY, price: '98', qty: '1', mark: '50' },
      ),
    );
    expect(replaced.accepted).toBe(true);
    expect(formatAmount(replaced.resting!.price)).toBe('98');
    expect(formatAmount(replaced.resting!.remaining)).toBe('1');
    expect(book.depth().bids).toEqual([['98', '1']]);
  });

  it('refuses when strike disagrees — do not replace a different contract', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(
      order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }),
    );
    const replaced = book.amend(
      patch(
        { orderId: OPT, version: rest.resting!.version },
        { replace: true, strike: '105', expiry: EXPIRY, price: '101', qty: '3' },
      ),
    );
    expect(replaced.accepted).toBe(false);
    expect(replaced.rejected?.code).toBe(STRIKE_DISAGREES);
    expect(book.depth().bids).toEqual([['99', '2']]);
  });

  it('refuses when expiry disagrees — do not replace a different contract', () => {
    const book = new OrderBook('BTC/USDT');
    const rest = book.submit(
      order({ id: OPT, type: 'limit', side: 'buy', qty: '2', price: '99', strike: '100', expiry: EXPIRY }),
    );
    const replaced = book.amend(
      patch(
        { orderId: OPT, version: rest.resting!.version },
        { replace: true, strike: '100', expiry: OTHER, price: '101', qty: '3' },
      ),
    );
    expect(replaced.accepted).toBe(false);
    expect(replaced.rejected?.code).toBe(EXPIRY_DISAGREES);
    expect(book.depth().bids).toEqual([['99', '2']]);
  });

  it('refuses when nothing is resting — no invented replace', () => {
    const book = new OrderBook('BTC/USDT');
    const replaced = book.amend(
      patch(
        { orderId: MISS, version: 1 },
        { replace: true, strike: '100', expiry: EXPIRY, price: '101', qty: '3' },
      ),
    );
    expect(replaced.accepted).toBe(false);
    expect(replaced.rejected?.code).toBe('order_not_found');
    expect(book.depth().bids).toEqual([]);
  });
});
