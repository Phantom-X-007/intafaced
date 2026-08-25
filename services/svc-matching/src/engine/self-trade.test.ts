import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import { SELF_TRADE, isSelfTrade, selfTradeRefuse } from './self-trade.js';

/**
 * Self-trade: refuse the taker. Do not invent a self-fill.
 * Resting maker stays. Missing or different accountIds match as today.
 */

const A = parseAmount;

const OWN = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';
const TAKE = '33333333-3333-4333-8333-333333333333';
const BEHIND = '44444444-4444-4444-8444-444444444444';

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
  return [...state.bids.flatMap((l) => l.orders.map((o) => o.orderId)), ...state.asks.flatMap((l) => l.orders.map((o) => o.orderId))];
}

describe('self-trade — refuse taker, never a self-fill', () => {
  it('crossing own rest at the same price refuses — no fill, rest stays', () => {
    const book = new OrderBook('BTC/USDT');
    const before = (() => {
      book.submit(order({ id: OWN, account: 'same', side: 'buy', qty: '1', price: '100' }));
      return book.serialize();
    })();

    const result = book.submit(order({ id: TAKE, account: 'same', side: 'sell', qty: '1', price: '100' }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(SELF_TRADE);
    expect(result.rejected?.message).toMatch(/does not invent a self-fill/);
    expect(result.fills).toHaveLength(0);
    expect(result.resting).toBeNull();
    expect(result.cancellations).toHaveLength(0);
    expect(result.sequence).toBeNull();
    expect(liveIds(book)).toEqual([OWN]);
    expect(book.serialize()).toBe(before);
  });

  it('does not cancel the resting maker and does not walk past it', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: OWN, account: 'same', side: 'buy', qty: '1', price: '100' }));
    book.submit(order({ id: STRANGER, account: 'other', side: 'buy', qty: '1', price: '100' }));
    const before = book.serialize();

    const result = book.submit(order({ id: TAKE, account: 'same', side: 'sell', qty: '2', price: '100' }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(SELF_TRADE);
    expect(result.fills).toHaveLength(0);
    expect(liveIds(book)).toEqual([OWN, STRANGER]);
    expect(formatAmount(book.bestBid()!)).toBe('100');
    expect(book.serialize()).toBe(before);
  });

  it('crossing a different account still fills', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: STRANGER, account: 'mm', side: 'sell', qty: '1', price: '100' }));

    const result = book.submit(order({ id: TAKE, account: 'desk', side: 'buy', qty: '1', price: '100' }));

    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]!.makerAccountId).toBe('mm');
    expect(result.fills[0]!.takerAccountId).toBe('desk');
    expect(formatAmount(result.fills[0]!.qty)).toBe('1');
    expect(liveIds(book)).toEqual([]);
  });

  it('empty accountIds are missing — they still fill, not self_trade', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: OWN, account: '', side: 'sell', qty: '1', price: '100' }));

    const result = book.submit(order({ id: TAKE, account: '', side: 'buy', qty: '1', price: '100' }));

    expect(result.accepted).toBe(true);
    expect(result.rejected).toBeUndefined();
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]!.makerAccountId).toBe('');
    expect(result.fills[0]!.takerAccountId).toBe('');
  });

  it('empty taker against a named rest still fills', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: STRANGER, account: 'mm', side: 'sell', qty: '1', price: '100' }));

    const result = book.submit(order({ id: TAKE, account: '', side: 'buy', qty: '1', price: '100' }));

    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]!.makerAccountId).toBe('mm');
  });

  it('does not fill a stranger behind own rest — first self match refuses the submit', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: OWN, account: 'same', side: 'buy', qty: '1', price: '101' }));
    book.submit(order({ id: BEHIND, account: 'other', side: 'buy', qty: '1', price: '100' }));
    const before = book.serialize();

    const result = book.submit(order({ id: TAKE, account: 'same', side: 'sell', qty: '2', price: '100', tif: 'IOC' }));

    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe(SELF_TRADE);
    expect(result.fills).toHaveLength(0);
    expect(liveIds(book)).toEqual([OWN, BEHIND]);
    expect(book.serialize()).toBe(before);
  });

  it('journal replay of a refused self-trade does not invent a fill or cancel the rest', () => {
    const marketId = 'BTC/USDT';
    const rest = order({ id: OWN, account: 'same', side: 'buy', qty: '1', price: '100' });
    const take = order({ id: TAKE, account: 'same', side: 'sell', qty: '1', price: '100' });
    const journal = new MemoryJournal();
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T16:00:00.000Z', order: toWire(rest) });
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T16:00:01.000Z', order: toWire(take) });

    const live = new OrderBook(marketId);
    expect(live.submit(rest).accepted).toBe(true);
    expect(live.submit(take).accepted).toBe(false);
    const replayed = replay(journal.read()).get(marketId);
    expect(replayed?.asks).toEqual([]);
    expect(replayed?.bids.map((l) => l.orders.map((o) => o.orderId))).toEqual([[OWN]]);
  });

  it('helpers: same live account only when both ids are present', () => {
    expect(isSelfTrade('a', 'a')).toBe(true);
    expect(isSelfTrade('a', 'b')).toBe(false);
    expect(isSelfTrade('', '')).toBe(false);
    expect(isSelfTrade('', 'a')).toBe(false);
    expect(selfTradeRefuse().code).toBe(SELF_TRADE);
    expect(selfTradeRefuse().message).toMatch(/does not invent a self-fill/);
  });
});
