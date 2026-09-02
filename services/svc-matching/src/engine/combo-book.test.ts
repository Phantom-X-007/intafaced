import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import { MemoryJournal, replay, toWire } from './journal.js';
import type { ComboLeg, EngineOrder, EngineOrderType, OrderSide, TimeInForce } from './types.js';
import './option.js';
import { comboRestOf, installComboBook } from './combo-book.js';
import {
  COMBO_LEGS_MISSING,
  EXPIRY_MISSING,
  RATIO_MISSING,
  STRIKE_MISSING,
  comboIntentRefuse,
} from './option-combo.js';

installComboBook();

/**
 * CARD E2 hitch. Named legs + ratios rest as one instrument.
 * Incomplete combo keeps A8 refuse. Two independent options are not a combo.
 */

const A = parseAmount;

const COMBO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPT_A = '11111111-1111-4111-8111-111111111111';
const OPT_B = '22222222-2222-4222-8222-222222222222';
const MISS = '44444444-4444-4444-8444-444444444444';
const EXPIRY = '2026-12-31T00:00:00.000Z';

function namedLegs(over: Partial<ComboLeg>[] = []): ComboLeg[] {
  const base: ComboLeg[] = [
    { name: 'call', ratio: A('1'), strike: A('100'), expiry: EXPIRY },
    { name: 'put', ratio: A('-1'), strike: A('100'), expiry: EXPIRY },
  ];
  return base.map((leg, i) => ({ ...leg, ...(over[i] ?? {}) }));
}

function order(spec: {
  id: string;
  account?: string;
  type?: EngineOrderType;
  side: OrderSide;
  qty: string;
  price?: string;
  strike?: string | null;
  expiry?: string | null;
  combo?: boolean;
  legs?: ComboLeg[] | null;
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
    ...(spec.strike !== undefined ? { strike: spec.strike == null ? null : A(spec.strike) } : {}),
    ...(spec.expiry !== undefined ? { expiry: spec.expiry } : {}),
    ...(spec.combo !== undefined ? { combo: spec.combo } : {}),
    ...(spec.legs !== undefined ? { legs: spec.legs } : {}),
  };
}

function liveIds(book: OrderBook): string[] {
  const state = book.toState();
  return [...state.bids.flatMap((l) => l.orders.map((o) => o.orderId)), ...state.asks.flatMap((l) => l.orders.map((o) => o.orderId))];
}

describe('combo book — named legs rest as one instrument', () => {
  it('named legs + ratios, combo:true, one qty/price → accepted, exactly one live orderId', () => {
    const book = new OrderBook('BTC/USDT');
    const result = book.submit(
      order({
        id: COMBO,
        type: 'limit',
        side: 'buy',
        qty: '2',
        price: '99',
        combo: true,
        legs: namedLegs(),
      }),
    );
    expect(result.accepted).toBe(true);
    expect(result.resting).toMatchObject({ kind: 'book', orderId: COMBO });
    expect(liveIds(book)).toEqual([COMBO]);
    expect(book.depth().bids).toEqual([['99', '2']]);
    expect(book.depth().asks).toEqual([]);
    expect(comboIntentRefuse({ combo: true, legs: namedLegs() })).toBeNull();
  });

  it('remembered combo has both leg names and ratios as ledger Amounts', () => {
    const book = new OrderBook('BTC/USDT');
    book.submit(
      order({
        id: COMBO,
        side: 'buy',
        qty: '2',
        price: '99',
        combo: true,
        legs: namedLegs(),
      }),
    );
    const remembered = comboRestOf(book, COMBO);
    expect(remembered?.orderId).toBe(COMBO);
    expect(remembered?.legs).toHaveLength(2);
    expect(remembered?.legs.map((leg) => leg.name)).toEqual(['call', 'put']);
    expect(remembered?.legs.map((leg) => formatAmount(leg.ratio))).toEqual(['1', '-1']);
    expect(typeof remembered?.legs[0]?.ratio).toBe('bigint');
    expect(typeof remembered?.legs[1]?.ratio).toBe('bigint');
    expect(remembered?.legs[0]?.ratio).toBe(A('1'));
    expect(remembered?.legs[1]?.ratio).toBe(A('-1'));
  });

  it('missing legs/ratio/strike/expiry still refuse A8 codes; liveIds empty', () => {
    const book = new OrderBook('BTC/USDT');
    const missingLegs = book.submit(
      order({
        id: MISS,
        side: 'buy',
        qty: '2',
        price: '99',
        combo: true,
      }),
    );
    expect(missingLegs.accepted).toBe(false);
    expect(missingLegs.rejected?.code).toBe(COMBO_LEGS_MISSING);
    expect(comboIntentRefuse({ combo: true })?.code).toBe(COMBO_LEGS_MISSING);

    const missingRatio = book.submit(
      order({
        id: MISS,
        side: 'buy',
        qty: '2',
        price: '99',
        combo: true,
        legs: namedLegs([{ ratio: null }]),
      }),
    );
    expect(missingRatio.accepted).toBe(false);
    expect(missingRatio.rejected?.code).toBe(RATIO_MISSING);

    const missingStrike = book.submit(
      order({
        id: MISS,
        side: 'buy',
        qty: '2',
        price: '99',
        combo: true,
        legs: namedLegs([{ strike: null }]),
      }),
    );
    expect(missingStrike.accepted).toBe(false);
    expect(missingStrike.rejected?.code).toBe(STRIKE_MISSING);

    const missingExpiry = book.submit(
      order({
        id: MISS,
        side: 'buy',
        qty: '2',
        price: '99',
        combo: true,
        legs: namedLegs([{ expiry: null }]),
      }),
    );
    expect(missingExpiry.accepted).toBe(false);
    expect(missingExpiry.rejected?.code).toBe(EXPIRY_MISSING);
    expect(liveIds(book)).toEqual([]);
    expect(book.depth().bids).toEqual([]);
    expect(comboRestOf(book, MISS)).toBeUndefined();
  });

  it('two separate option submits (no combo) are two rests — not labeled combo', () => {
    const book = new OrderBook('BTC/USDT');
    const a = book.submit(
      order({
        id: OPT_A,
        type: 'limit',
        side: 'buy',
        qty: '2',
        price: '99',
        strike: '100',
        expiry: EXPIRY,
      }),
    );
    const b = book.submit(
      order({
        id: OPT_B,
        type: 'limit',
        side: 'buy',
        qty: '3',
        price: '98',
        strike: '100',
        expiry: EXPIRY,
      }),
    );
    expect(a.accepted).toBe(true);
    expect(b.accepted).toBe(true);
    expect(liveIds(book).sort()).toEqual([OPT_A, OPT_B].sort());
    expect(book.depth().bids).toEqual([
      ['99', '2'],
      ['98', '3'],
    ]);
    expect(comboRestOf(book, OPT_A)).toBeUndefined();
    expect(comboRestOf(book, OPT_B)).toBeUndefined();
  });

  it('journal replay of a complete combo restores one rest, not two, not empty', () => {
    const marketId = 'BTC/USDT';
    const journal = new MemoryJournal();
    const comboed = order({
      id: COMBO,
      side: 'buy',
      qty: '2',
      price: '99',
      combo: true,
      legs: namedLegs(),
    });
    const wire = toWire(comboed);
    expect(wire.combo).toBe(true);
    expect(wire.legs).toHaveLength(2);
    expect(wire.legs?.[0]?.ratio).toBe('1');
    expect(wire.legs?.[1]?.ratio).toBe('-1');
    journal.append({ kind: 'submit', marketId, at: '2026-08-31T12:00:00.000Z', order: wire });
    const live = new OrderBook(marketId).submit(comboed);
    expect(live.accepted).toBe(true);
    expect(live.resting?.orderId).toBe(COMBO);
    const restored = replay(journal.read()).get(marketId);
    expect(restored).toBeDefined();
    expect(liveIds(restored!)).toEqual([COMBO]);
    expect(restored!.depth().bids).toEqual([['99', '2']]);
    expect(restored!.depth().asks).toEqual([]);
    const remembered = comboRestOf(restored!, COMBO);
    expect(remembered?.legs.map((leg) => leg.name)).toEqual(['call', 'put']);
    expect(remembered?.legs.map((leg) => formatAmount(leg.ratio))).toEqual(['1', '-1']);
  });
});
