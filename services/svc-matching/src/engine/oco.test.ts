import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';

/**
 * Linked TP+SL (OCO) on the existing stop/limit path.
 *
 * The engine does not invent a trigger. Legs rest with the stopPrice the
 * caller already sent. First fill of either leg cancels the sibling.
 */

const A = parseAmount;

const TP = '22222222-2222-4222-8222-222222222222';
const SL = '33333333-3333-4333-8333-333333333333';
const LIQ = '11111111-1111-4111-8111-111111111111';

function order(spec: {
  id: string;
  account?: string;
  type?: EngineOrderType;
  side: OrderSide;
  qty: string;
  price?: string;
  stopPrice?: string;
  tif?: TimeInForce;
  ocoSiblingId?: string;
}): EngineOrder {
  const type = spec.type ?? (spec.price === undefined ? 'market' : 'limit');
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type,
    side: spec.side,
    qty: A(spec.qty),
    price: spec.price === undefined ? null : A(spec.price),
    stopPrice: spec.stopPrice === undefined ? null : A(spec.stopPrice),
    tif: spec.tif ?? 'GTC',
    ...(spec.ocoSiblingId ? { ocoSiblingId: spec.ocoSiblingId } : {}),
  };
}

function liveIds(book: OrderBook): string[] {
  const state = book.toState();
  const ids = [
    ...state.bids.flatMap((l) => l.orders.map((o) => o.orderId)),
    ...state.asks.flatMap((l) => l.orders.map((o) => o.orderId)),
    ...state.stops.map((s) => s.orderId),
  ];
  return ids.sort();
}

describe('OCO — rest a linked TP+SL', () => {
  it('rests both legs on the existing stop book without inventing a trigger', () => {
    const book = new OrderBook('BTC/USDT');
    const tp = book.submit(
      order({ id: TP, type: 'stop_limit', side: 'sell', qty: '1', price: '110', stopPrice: '110', ocoSiblingId: SL }),
    );
    const sl = book.submit(
      order({ id: SL, type: 'stop', side: 'sell', qty: '1', stopPrice: '90', ocoSiblingId: TP }),
    );

    expect(tp.accepted).toBe(true);
    expect(sl.accepted).toBe(true);
    expect(tp.resting?.kind).toBe('stop');
    expect(sl.resting?.kind).toBe('stop');
    expect(tp.fills).toHaveLength(0);
    expect(sl.fills).toHaveLength(0);
    expect(liveIds(book)).toEqual([SL, TP].sort());
    // No last print — existing trigger rule leaves both resting.
    expect(book.lastPrice).toBeNull();
  });

  it('first fill of the TP cancels the resting SL sibling', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: LIQ, account: 'mm', side: 'buy', qty: '1', price: '110' }));
    book.submit(order({ id: SL, type: 'stop', side: 'sell', qty: '1', stopPrice: '90', ocoSiblingId: TP }));
    const tp = book.submit(
      order({ id: TP, account: 'desk', side: 'sell', qty: '1', price: '110', ocoSiblingId: SL }),
    );

    expect(tp.accepted).toBe(true);
    expect(tp.fills).toHaveLength(1);
    expect(formatAmount(tp.fills[0]!.qty)).toBe('1');
    expect(tp.cancellations.map((c) => [c.orderId, c.reason])).toEqual([[SL, 'oco_sibling_filled']]);
    expect(liveIds(book)).toEqual([]);
  });

  it('first fill of the SL (existing stop trigger) cancels the TP sibling before the TP can also fire', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: 'bid-100', account: 'mm', side: 'buy', qty: '5', price: '100' }));
    book.submit(order({ id: 'bid-90', account: 'mm', side: 'buy', qty: '5', price: '90' }));
    book.submit(order({ id: 'warmup', account: 'mm', side: 'sell', qty: '5' })); // last = 100

    // TP is a resting sell limit above last — the engine does not invent an
    // upside-stop trigger. SL is the existing sell-stop on the way down.
    book.submit(order({ id: TP, side: 'sell', qty: '1', price: '110', ocoSiblingId: SL }));
    book.submit(order({ id: SL, type: 'stop', side: 'sell', qty: '1', stopPrice: '95', ocoSiblingId: TP }));

    const print = book.submit(order({ id: 'crash', account: 'taker', side: 'sell', qty: '1' })); // prints 90

    expect(print.triggered.map((t) => t.orderId)).toEqual([SL]);
    const sl = print.triggered[0]!;
    expect(sl.fills.length).toBeGreaterThan(0);
    expect(sl.cancellations.map((c) => [c.orderId, c.reason])).toContainEqual([TP, 'oco_sibling_filled']);
    expect(liveIds(book)).not.toContain(TP);
    expect(liveIds(book)).not.toContain(SL);
  });

  it('refuses the second leg when its sibling is already terminal', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: LIQ, account: 'mm', side: 'buy', qty: '1', price: '110' }));
    const first = book.submit(order({ id: TP, account: 'desk', side: 'sell', qty: '1', price: '110', ocoSiblingId: SL }));
    expect(first.accepted).toBe(true);
    expect(first.fills).toHaveLength(1);

    const second = book.submit(
      order({ id: SL, type: 'stop', side: 'sell', qty: '1', stopPrice: '90', ocoSiblingId: TP }),
    );

    expect(second.accepted).toBe(false);
    expect(second.rejected?.code).toBe('oco_sibling_terminal');
    expect(second.fills).toHaveLength(0);
    expect(book.currentSequence).toBe(first.sequence! + first.fills.length);
  });

  it('refuses a self-linked sibling', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: TP, side: 'sell', qty: '1', price: '110', ocoSiblingId: TP }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('invalid_oco_sibling');
    expect(book.currentSequence).toBe(0);
  });

  it('a partial first fill still cancels the sibling', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: LIQ, account: 'mm', side: 'buy', qty: '1', price: '110' }));
    book.submit(order({ id: SL, type: 'stop', side: 'sell', qty: '1', stopPrice: '90', ocoSiblingId: TP }));
    const tp = book.submit(
      order({ id: TP, account: 'desk', side: 'sell', qty: '3', price: '110', ocoSiblingId: SL }),
    );

    expect(formatAmount(tp.fills[0]!.qty)).toBe('1');
    expect(formatAmount(tp.resting!.remaining)).toBe('2');
    expect(tp.cancellations.map((c) => c.reason)).toContain('oco_sibling_filled');
    expect(liveIds(book)).toEqual([TP]);
  });

  it('journal replay rebuilds the pair and the first-fill cancel', () => {
    const marketId = 'BTC/USDT';
    const at = '2026-08-25T00:00:00.000Z';
    const journal = new MemoryJournal();
    const live = new OrderBook(marketId);

    const submits: EngineOrder[] = [
      order({ id: LIQ, account: 'mm', side: 'buy', qty: '1', price: '110' }),
      order({ id: SL, type: 'stop', side: 'sell', qty: '1', stopPrice: '90', ocoSiblingId: TP }),
      order({ id: TP, account: 'desk', side: 'sell', qty: '1', price: '110', ocoSiblingId: SL }),
    ];
    for (const o of submits) {
      journal.append({ kind: 'submit', marketId, at, order: toWire(o) });
      live.submit(o);
    }

    const restored = replay(journal.read()).get(marketId)!;
    expect(restored.serialize()).toBe(live.serialize());
    expect(liveIds(restored)).toEqual([]);
  });
});
