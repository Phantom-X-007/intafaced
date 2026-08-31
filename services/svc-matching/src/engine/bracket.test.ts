import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import {
  entryRefuse,
  installBracket,
  readEntry,
  stopLossRefuse,
  takeProfitRefuse,
  wantsBracket,
} from './bracket.js';
import type { EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';

/**
 * Linked bracket: rest entry, then rest take-profit and stop-loss on entry fill.
 * Refuse if any leg is missing. The engine does not invent a trigger.
 */

installBracket(OrderBook);

const A = parseAmount;
const ENTRY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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
  bracket?: boolean;
  takeProfit?: string | null;
  stopLoss?: string | null;
  takeProfitOrderId?: string;
  stopLossOrderId?: string;
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
    ...(spec.bracket !== undefined ? { bracket: spec.bracket } : {}),
    ...(spec.takeProfit !== undefined ? { takeProfit: spec.takeProfit == null ? null : A(spec.takeProfit) } : {}),
    ...(spec.stopLoss !== undefined ? { stopLoss: spec.stopLoss == null ? null : A(spec.stopLoss) } : {}),
    ...(spec.takeProfitOrderId ? { takeProfitOrderId: spec.takeProfitOrderId } : {}),
    ...(spec.stopLossOrderId ? { stopLossOrderId: spec.stopLossOrderId } : {}),
  } as EngineOrder;
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

describe('bracket — rest entry, take-profit, and stop-loss', () => {
  it('rests the entry without resting the exits', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(
      order({
        id: ENTRY,
        side: 'buy',
        qty: '1',
        price: '100',
        bracket: true,
        takeProfit: '110',
        stopLoss: '90',
        takeProfitOrderId: TP,
        stopLossOrderId: SL,
      }),
    );
    expect(result.accepted).toBe(true);
    expect(result.fills).toHaveLength(0);
    expect(liveIds(book)).toEqual([ENTRY]);
    expect(book.lastPrice).toBeNull();
  });

  it('entry fill rests the exits — no invented trigger', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(
      order({
        id: ENTRY,
        side: 'buy',
        qty: '1',
        price: '100',
        bracket: true,
        takeProfit: '110',
        stopLoss: '90',
        takeProfitOrderId: TP,
        stopLossOrderId: SL,
      }),
    );
    const result = book.submit(order({ id: LIQ, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    expect(result.accepted).toBe(true);
    expect(result.fills.length).toBeGreaterThan(0);
    expect(formatAmount(result.fills[0]!.qty)).toBe('1');
    expect(liveIds(book)).toEqual([SL, TP].sort());
    expect(liveIds(book)).not.toContain(ENTRY);
  });

  it('an immediate entry fill rests the exits in the same submit', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: LIQ, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    const result = book.submit(
      order({
        id: ENTRY,
        side: 'buy',
        qty: '1',
        price: '100',
        bracket: true,
        takeProfit: '110',
        stopLoss: '90',
        takeProfitOrderId: TP,
        stopLossOrderId: SL,
      }),
    );
    expect(result.accepted).toBe(true);
    expect(result.fills.length).toBeGreaterThan(0);
    expect(liveIds(book)).toEqual([SL, TP].sort());
    expect(liveIds(book)).not.toContain(ENTRY);
  });

  it('refuses a missing take-profit — last on the book is not a trigger', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: LIQ, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    const result = book.submit(order({ id: ENTRY, side: 'buy', qty: '1', price: '100', bracket: true, stopLoss: '90' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('missing_stop_price');
    expect(result.rejected?.message).toContain('take-profit');
    expect(result.fills).toHaveLength(0);
    expect(liveIds(book)).toEqual([LIQ]);
  });

  it('refuses a missing stop-loss — last on the book is not a trigger', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: ENTRY, side: 'buy', qty: '1', price: '100', bracket: true, takeProfit: '110' }));
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('missing_stop_price');
    expect(result.rejected?.message).toContain('stop-loss');
    expect(result.fills).toHaveLength(0);
    expect(liveIds(book)).toEqual([]);
  });

  it('refuses a missing entry — last on the book is not a trigger', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(order({ id: LIQ, account: 'mm', side: 'sell', qty: '1', price: '100' }));
    const result = book.submit(
      order({
        id: ENTRY,
        type: 'limit',
        side: 'buy',
        qty: '1',
        bracket: true,
        takeProfit: '110',
        stopLoss: '90',
      }),
    );
    expect(result.accepted).toBe(false);
    expect(result.rejected?.code).toBe('missing_price');
    expect(result.rejected?.message).toContain('entry');
    expect(result.fills).toHaveLength(0);
    expect(liveIds(book)).toEqual([LIQ]);
  });

  it('plain GTC does not rest a bracket', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(order({ id: ENTRY, side: 'buy', qty: '1', price: '100' }));
    expect(result.accepted).toBe(true);
    expect(liveIds(book)).toEqual([ENTRY]);
  });

  it('read helpers treat missing and zero as not set', () => {
    expect(wantsBracket({})).toBe(false);
    expect(wantsBracket({ bracket: true })).toBe(true);
    expect(readEntry({})).toBeNull();
    expect(readEntry({ price: null })).toBeNull();
    expect(readEntry({ price: A('0') })).toBeNull();
    expect(readEntry({ price: A('100') })).toBe(A('100'));
    expect(readEntry({ type: 'market' })).toBeNull();
    expect(entryRefuse({ type: 'limit' })?.message).toContain('invent a trigger');
    expect(entryRefuse({ type: 'market' })).toBeNull();
    expect(takeProfitRefuse(null)?.message).toContain('invent a trigger');
    expect(stopLossRefuse(null)?.message).toContain('invent a trigger');
    expect(takeProfitRefuse(A('110'))).toBeNull();
    expect(stopLossRefuse(A('90'))).toBeNull();
  });
});
