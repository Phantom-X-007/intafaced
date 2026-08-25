import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import { bindPostOnlyTif, inheritRestingTif, postOnlyCannotRest } from './post-only.js';

/**
 * Rest a post-only. Refuse if it would take. No invented price.
 */

const A = parseAmount;

const ASK = '11111111-1111-4111-8111-111111111111';
const PO = '22222222-2222-4222-8222-222222222222';
const CROSS = '33333333-3333-4333-8333-333333333333';
const AMEND = '22222222-2222-4222-8222-222222222222';

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

describe('post-only — rest if it would not take', () => {
  it('rests a post-only behind the spread — no invented price', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    const result = book.submit(order({ id: PO, side: 'buy', qty: '1', price: '99', tif: 'PO' }));

    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(0);
    expect(result.resting?.kind).toBe('book');
    expect(formatAmount(result.resting!.price)).toBe('99');
    expect(book.toState().bids[0]!.orders[0]!.postOnly).toBe(true);
    expect(liveIds(book).sort()).toEqual([ASK, PO].sort());
  });

  it('refuses a post-only that would take', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    const result = book.submit(order({ id: CROSS, side: 'buy', qty: '1', price: '100', tif: 'PO' }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('post_only_would_cross');
    expect(result.fills).toHaveLength(0);
    expect(liveIds(book)).toEqual([ASK]);
    expect(book.currentSequence).toBe(1);
  });

  it('refuses a post-only without a price — the engine does not invent one', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: PO, side: 'buy', qty: '1', tif: 'PO' }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('invalid_tif');
    expect(book.currentSequence).toBe(0);
  });

  it('a later price amend that would take is refused — the rest stays post-only', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    const rest = book.submit(order({ id: PO, side: 'buy', qty: '1', price: '99', tif: 'PO' }));
    expect(rest.accepted).toBe(true);

    const amended = book.amend({ orderId: AMEND, expectedVersion: rest.resting!.version, price: A('100') });

    expect(amended.accepted).toBe(false);
    expect(amended.rejected?.code).toBe('post_only_would_cross');
    expect(amended.fills).toHaveLength(0);
    expect(liveIds(book).sort()).toEqual([ASK, PO].sort());
    expect(book.toState().bids[0]!.orders[0]!.postOnly).toBe(true);
    expect(book.toState().bids[0]!.orders[0]!.remaining).toBe('1');
  });

  it('journal replay rebuilds the post-only rest', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const live = new OrderBook(marketId);
    const ask = order({ id: ASK, account: 'mm', side: 'sell', qty: '1', price: '100' });
    const rest = order({ id: PO, side: 'buy', qty: '1', price: '99', tif: 'PO' });
    for (const o of [ask, rest]) {
      journal.append({ kind: 'submit', marketId, at: '2026-08-25T14:00:00.000Z', order: toWire(o) });
      live.submit(o);
    }
    const restored = replay(journal.read()).get(marketId)!;
    expect(restored.serialize()).toBe(live.serialize());
    expect(restored.toState().bids[0]!.orders[0]!.postOnly).toBe(true);
  });

  it('bindPostOnlyTif maps the flag; immediate TIF cannot rest', () => {
    expect(bindPostOnlyTif('GTC', true)).toBe('PO');
    expect(bindPostOnlyTif('PO', true)).toBe('PO');
    expect(bindPostOnlyTif('GTC', false)).toBe('GTC');
    expect(postOnlyCannotRest('IOC', true)).toBe(true);
    expect(inheritRestingTif(undefined, true)).toBe('PO');
    expect(inheritRestingTif(undefined, false)).toBe('GTC');
  });
});
