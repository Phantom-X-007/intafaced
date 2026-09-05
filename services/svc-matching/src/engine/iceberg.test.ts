import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import {
  ICEBERG_DISPLAY_MISSING,
  ICEBERG_DISPLAY_NOT_SMALLER,
  hiddenRemaining,
  icebergDisplayRefuse,
  refillDisplay,
  visibleRemaining,
  wantsIceberg,
} from './iceberg.js';

/**
 * Rest an iceberg. Only the display qty is visible.
 * Hidden remainder refills as display takes.
 * No invented display.
 */

const A = parseAmount;

const ICE = '11111111-1111-4111-8111-111111111111';
const TAKE = '22222222-2222-4222-8222-222222222222';
const TAKE2 = '33333333-3333-4333-8333-333333333333';
const MISS = '44444444-4444-4444-8444-444444444444';
const BIG = '55555555-5555-4555-8555-555555555555';

function order(spec: {
  id: string;
  account?: string;
  type?: EngineOrderType;
  side: OrderSide;
  qty: string;
  price?: string;
  tif?: TimeInForce;
  displayQty?: string | null;
  iceberg?: boolean;
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
    ...(spec.iceberg === true || spec.displayQty !== undefined
      ? { iceberg: true, displayQty: spec.displayQty == null ? null : A(spec.displayQty) }
      : {}),
  };
}

describe('iceberg — display visible, hidden refills', () => {
  it('rests with only the display qty on the public book', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: ICE, side: 'sell', qty: '10', price: '100', displayQty: '2' }));

    expect(result.accepted).toBe(true);
    expect(result.resting).not.toBeNull();
    expect(formatAmount(result.resting!.remaining)).toBe('10');
    expect(book.depth(50).asks).toEqual([['100', '2']]);
    const state = book.toState().asks[0]!.orders[0]!;
    expect(state.remaining).toBe('10');
    expect(state.displayQty).toBe('2');
    expect(state.displayRemaining).toBe('2');
  });

  it('a take larger than display only hits the visible slice', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ICE, account: 'mm', side: 'sell', qty: '10', price: '100', displayQty: '2' }));
    const take = book.submit(order({ id: TAKE, side: 'buy', qty: '8', price: '100' }));

    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(formatAmount(take.fills[0]!.qty)).toBe('2');
    expect(formatAmount(take.resting!.remaining)).toBe('6');
    const ice = book.toState().asks[0]!.orders.find((o) => o.orderId === ICE)!;
    expect(ice.remaining).toBe('8');
    expect(ice.displayRemaining).toBe('2');
    expect(book.depth(50).asks).toEqual([['100', '2']]);
  });

  it('hidden remainder refills the display after the visible slice is taken', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ICE, account: 'mm', side: 'sell', qty: '5', price: '100', displayQty: '2' }));
    book.submit(order({ id: TAKE, side: 'buy', qty: '2', price: '100' }));

    const ice = book.toState().asks[0]!.orders[0]!;
    expect(ice.orderId).toBe(ICE);
    expect(ice.remaining).toBe('3');
    expect(ice.displayRemaining).toBe('2');
    expect(book.depth(50).asks).toEqual([['100', '2']]);

    const take2 = book.submit(order({ id: TAKE2, side: 'buy', qty: '2', price: '100' }));
    expect(formatAmount(take2.fills[0]!.qty)).toBe('2');
    const after = book.toState().asks[0]!.orders[0]!;
    expect(after.remaining).toBe('1');
    expect(after.displayRemaining).toBe('1');
    expect(book.depth(50).asks).toEqual([['100', '1']]);
  });

  it('refuses a missing display — no invented display', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: MISS, side: 'sell', qty: '10', price: '100', iceberg: true }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(ICEBERG_DISPLAY_MISSING);
    expect(result.resting).toBeNull();
    expect(book.depth(50).asks).toEqual([]);
  });

  it('refuses a display that is not smaller than total', () => {
    const book = new OrderBook('BTC/USDT');
    const same = book.submit(order({ id: BIG, side: 'sell', qty: '10', price: '100', displayQty: '10' }));
    expect(same.accepted).toBe(false);
    expect(same.rejected?.code).toBe(ICEBERG_DISPLAY_NOT_SMALLER);

    const over = book.submit(order({ id: MISS, side: 'sell', qty: '10', price: '100', displayQty: '11' }));
    expect(over.accepted).toBe(false);
    expect(over.rejected?.code).toBe(ICEBERG_DISPLAY_NOT_SMALLER);
    expect(book.depth(50).asks).toEqual([]);
  });

  it('journal replay keeps hidden remainder off the public book', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const live = new OrderBook(marketId);
    const ice = order({ id: ICE, account: 'mm', side: 'sell', qty: '10', price: '100', displayQty: '2' });
    const take = order({ id: TAKE, side: 'buy', qty: '2', price: '100' });
    for (const o of [ice, take]) {
      journal.append({ kind: 'submit', marketId, at: '2026-08-25T15:00:00.000Z', order: toWire(o) });
      live.submit(o);
    }
    const restored = replay(journal.read()).get(marketId)!;
    expect(restored.serialize()).toBe(live.serialize());
    expect(restored.depth(50).asks).toEqual([['100', '2']]);
    expect(restored.toState().asks[0]!.orders[0]!.remaining).toBe('8');
  });

  it('helpers refuse missing and not-smaller display', () => {
    expect(icebergDisplayRefuse(A('10'), null)?.code).toBe(ICEBERG_DISPLAY_MISSING);
    expect(icebergDisplayRefuse(A('10'), A('0'))?.code).toBe(ICEBERG_DISPLAY_MISSING);
    expect(icebergDisplayRefuse(A('10'), A('10'))?.code).toBe(ICEBERG_DISPLAY_NOT_SMALLER);
    expect(icebergDisplayRefuse(A('10'), A('2'))).toBeNull();
    expect(formatAmount(visibleRemaining(A('10'), A('2')))).toBe('2');
    expect(formatAmount(visibleRemaining(A('10'), null))).toBe('10');
    expect(formatAmount(refillDisplay(A('2'), A('1')))).toBe('1');
    expect(formatAmount(hiddenRemaining(A('10'), A('2')))).toBe('8');
    expect(wantsIceberg({ iceberg: true })).toBe(true);
    expect(wantsIceberg({})).toBe(false);
  });
});
