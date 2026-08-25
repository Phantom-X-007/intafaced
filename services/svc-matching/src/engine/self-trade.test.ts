import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import { SELF_TRADE_PREVENTION, isSelfTrade, selfTradeExpire } from './self-trade.js';

/**
 * Self-trade: expire the resting maker, continue the taker.
 * Do not invent a self-fill. Missing or different accountIds match as today.
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

describe('self-trade — expire resting, never a self-fill', () => {
  it('crossing own rest expires the rest — no fill, taker continues', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: OWN, account: 'same', side: 'buy', qty: '1', price: '100' }));

    const result = book.submit(order({ id: TAKE, account: 'same', side: 'sell', qty: '1', price: '100' }));

    expect(result.accepted).toBe(true);
    expect(result.rejected).toBeUndefined();
    expect(result.fills).toHaveLength(0);
    expect(result.cancellations).toHaveLength(1);
    expect(result.cancellations[0]!.orderId).toBe(OWN);
    expect(result.cancellations[0]!.reason).toBe(SELF_TRADE_PREVENTION);
    expect(formatAmount(result.cancellations[0]!.remainingQty)).toBe('1');
    expect(result.resting?.orderId).toBe(TAKE);
    expect(liveIds(book)).toEqual([TAKE]);
    expect(book.bestBid()).toBeNull();
    expect(formatAmount(book.bestAsk()!)).toBe('100');
  });

  it('expires own rest and fills the stranger behind it', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: OWN, account: 'same', side: 'buy', qty: '1', price: '100' }));
    book.submit(order({ id: STRANGER, account: 'other', side: 'buy', qty: '1', price: '100' }));

    const result = book.submit(order({ id: TAKE, account: 'same', side: 'sell', qty: '2', price: '100' }));

    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]!.makerOrderId).toBe(STRANGER);
    expect(result.fills[0]!.makerAccountId).toBe('other');
    expect(result.fills[0]!.takerAccountId).toBe('same');
    expect(formatAmount(result.fills[0]!.qty)).toBe('1');
    expect(result.cancellations.map((c) => c.orderId)).toEqual([OWN]);
    expect(result.cancellations[0]!.reason).toBe(SELF_TRADE_PREVENTION);
    expect(result.resting?.orderId).toBe(TAKE);
    expect(liveIds(book)).toEqual([TAKE]);
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
    expect(result.cancellations).toHaveLength(0);
  });

  it('empty taker against a named rest still fills', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: STRANGER, account: 'mm', side: 'sell', qty: '1', price: '100' }));

    const result = book.submit(order({ id: TAKE, account: '', side: 'buy', qty: '1', price: '100' }));

    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]!.makerAccountId).toBe('mm');
  });

  it('walks past own rest across price levels and fills the stranger', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: OWN, account: 'same', side: 'buy', qty: '1', price: '101' }));
    book.submit(order({ id: BEHIND, account: 'other', side: 'buy', qty: '1', price: '100' }));

    const result = book.submit(order({ id: TAKE, account: 'same', side: 'sell', qty: '2', price: '100', tif: 'IOC' }));

    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]!.makerOrderId).toBe(BEHIND);
    expect(formatAmount(result.fills[0]!.qty)).toBe('1');
    expect(result.cancellations.map((c) => ({ orderId: c.orderId, reason: c.reason }))).toEqual([
      { orderId: OWN, reason: SELF_TRADE_PREVENTION },
      { orderId: TAKE, reason: 'ioc_remainder' },
    ]);
    expect(liveIds(book)).toEqual([]);
  });

  it('FOK with own rest in front of a stranger expires own rest and fills the stranger', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: OWN, account: 'same', side: 'sell', qty: '1', price: '100' }));
    book.submit(order({ id: BEHIND, account: 'other', side: 'sell', qty: '10', price: '100' }));

    const result = book.submit(order({ id: TAKE, account: 'same', side: 'buy', qty: '5', price: '100', tif: 'FOK' }));

    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]!.makerOrderId).toBe(BEHIND);
    expect(result.fills[0]!.makerAccountId).toBe('other');
    expect(formatAmount(result.fills[0]!.qty)).toBe('5');
    expect(result.cancellations.map((c) => c.orderId)).toEqual([OWN]);
    expect(result.cancellations[0]!.reason).toBe(SELF_TRADE_PREVENTION);
    expect(result.resting).toBeNull();
    expect(liveIds(book)).toEqual([BEHIND]);
  });

  it('FOK still fills when every rest is a different account', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: OWN, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    book.submit(order({ id: BEHIND, account: 'other', side: 'sell', qty: '10', price: '100' }));

    const result = book.submit(order({ id: TAKE, account: 'desk', side: 'buy', qty: '5', price: '100', tif: 'FOK' }));

    expect(result.accepted).toBe(true);
    expect(result.rejected).toBeUndefined();
    expect(result.fills).toHaveLength(2);
    expect(result.fills[0]!.makerAccountId).toBe('mm');
    expect(result.fills[1]!.makerAccountId).toBe('other');
    expect(formatAmount(result.fills[0]!.qty)).toBe('1');
    expect(formatAmount(result.fills[1]!.qty)).toBe('4');
    expect(liveIds(book)).toEqual([BEHIND]);
  });

  it('FOK empty accountIds are missing — they still fill, not self_trade', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: OWN, account: '', side: 'sell', qty: '5', price: '100' }));

    const result = book.submit(order({ id: TAKE, account: '', side: 'buy', qty: '5', price: '100', tif: 'FOK' }));

    expect(result.accepted).toBe(true);
    expect(result.rejected).toBeUndefined();
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]!.makerAccountId).toBe('');
    expect(result.fills[0]!.takerAccountId).toBe('');
    expect(formatAmount(result.fills[0]!.qty)).toBe('5');
  });

  it('journal replay expires the rest and does not invent a self-fill', () => {
    const marketId = 'BTC/USDT';
    const rest = order({ id: OWN, account: 'same', side: 'buy', qty: '1', price: '100' });
    const take = order({ id: TAKE, account: 'same', side: 'sell', qty: '1', price: '100' });
    const journal = new MemoryJournal();
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T16:00:00.000Z', order: toWire(rest) });
    journal.append({ kind: 'submit', marketId, at: '2026-08-25T16:00:01.000Z', order: toWire(take) });

    const live = new OrderBook(marketId);
    expect(live.submit(rest).accepted).toBe(true);
    const taken = live.submit(take);
    expect(taken.accepted).toBe(true);
    expect(taken.fills).toHaveLength(0);
    expect(taken.cancellations[0]!.reason).toBe(SELF_TRADE_PREVENTION);
    const replayed = replay(journal.read()).get(marketId);
    expect(replayed?.serialize()).toBe(live.serialize());
    expect(replayed?.bids).toEqual([]);
    expect(replayed?.asks.map((l) => l.orders.map((o) => o.orderId))).toEqual([[TAKE]]);
  });

  it('helpers: same live account only when both ids are present', () => {
    expect(isSelfTrade('a', 'a')).toBe(true);
    expect(isSelfTrade('a', 'b')).toBe(false);
    expect(isSelfTrade('', '')).toBe(false);
    expect(isSelfTrade('', 'a')).toBe(false);
    const expired = selfTradeExpire(OWN, 'same', A('1'), 7);
    expect(expired.reason).toBe(SELF_TRADE_PREVENTION);
    expect(expired.orderId).toBe(OWN);
    expect(expired.sequence).toBe(7);
  });
});
