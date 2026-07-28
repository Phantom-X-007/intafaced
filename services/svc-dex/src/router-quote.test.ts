import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount as amt } from '@intafaced/ledger-client/money';
import { effectivePrice, route, type VenueQuote } from './router-quote.js';

const book = (over: Partial<VenueQuote> = {}): VenueQuote => ({
  venue: 'internal-book',
  kind: 'book',
  fillableQty: amt('1'),
  quoteAmount: amt('100'),
  feeBps: 20,
  settlementCost: amt('0'),
  ...over,
});

const pool = (over: Partial<VenueQuote> = {}): VenueQuote => ({
  venue: 'amm-pool',
  kind: 'pool',
  fillableQty: amt('1'),
  quoteAmount: amt('100'),
  feeBps: 30,
  settlementCost: amt('2'),
  ...over,
});

describe('effective price — the only comparison that means anything', () => {
  it('raises a buyer’s cost per unit by the fee, because they receive less base', () => {
    // 100 quote for 1 base at 20bps → receive 0.998, so 100/0.998 ≈ 100.2004
    expect(formatAmount(effectivePrice(book(), 'buy'))).toBe('100.200400801603206412');
  });

  it('lowers a seller’s proceeds per unit by the fee', () => {
    // 100 quote at 20bps → 99.8 proceeds for 1 base
    expect(formatAmount(effectivePrice(book(), 'sell'))).toBe('99.8');
  });

  /**
   * The comparison headline prices get wrong. Both venues quote 100 for 1 base.
   * The pool charges more fee AND gas, so it is strictly worse — but a router
   * comparing `quoteAmount` alone would call them equal and pick arbitrarily.
   */
  it('separates two venues quoting the same headline price', () => {
    const b = effectivePrice(book(), 'buy');
    const p = effectivePrice(pool(), 'buy');

    expect(b).toBeLessThan(p);
    expect(formatAmount(b)).not.toBe(formatAmount(p));
  });

  it('charges settlement cost to the taker in BOTH directions', () => {
    // Gas is a cost whether buying or selling; it must never look like income.
    const buyWith = effectivePrice(pool({ settlementCost: amt('5') }), 'buy');
    const buyWithout = effectivePrice(pool({ settlementCost: amt('0') }), 'buy');
    expect(buyWith).toBeGreaterThan(buyWithout);

    const sellWith = effectivePrice(pool({ settlementCost: amt('5') }), 'sell');
    const sellWithout = effectivePrice(pool({ settlementCost: amt('0') }), 'sell');
    expect(sellWith).toBeLessThan(sellWithout);
  });

  it('refuses a fee that consumes the whole fill rather than dividing by zero', () => {
    expect(() => effectivePrice(book({ feeBps: 10_000 }), 'buy')).toThrow(/consumes the entire fill/);
  });

  it('refuses to price an empty quote', () => {
    expect(() => effectivePrice(book({ fillableQty: 0n }), 'buy')).toThrow(/no fillable quantity/);
  });
});

describe('routing', () => {
  it('sends the whole order to the better venue when one can fill it', () => {
    const r = route({ side: 'buy', qty: amt('1') }, [book(), pool()]);

    expect(r.legs).toHaveLength(1);
    expect(r.legs[0]!.venue).toBe('internal-book');
    expect(formatAmount(r.unfilledQty)).toBe('0');
  });

  it('splits across venues when the best one cannot fill alone', () => {
    const r = route({ side: 'buy', qty: amt('3') }, [
      book({ fillableQty: amt('1'), quoteAmount: amt('100') }),
      pool({ fillableQty: amt('5'), quoteAmount: amt('520') }),
    ]);

    expect(r.legs.map((l) => l.venue)).toEqual(['internal-book', 'amm-pool']);
    expect(formatAmount(r.legs[0]!.qty)).toBe('1');
    expect(formatAmount(r.legs[1]!.qty)).toBe('2');
    expect(formatAmount(r.filledQty)).toBe('3');
  });

  it('pro-rates a partial take exactly, with no float anywhere', () => {
    // Take 1 of a 3-unit quote costing 100 → exactly 100/3 in integer arithmetic.
    const r = route({ side: 'buy', qty: amt('1') }, [pool({ fillableQty: amt('3'), quoteAmount: amt('100') })]);
    expect(formatAmount(r.legs[0]!.quoteAmount)).toBe('33.333333333333333333');
  });

  it('reports an unfilled remainder rather than pretending to fill it', () => {
    const r = route({ side: 'buy', qty: amt('10') }, [book({ fillableQty: amt('1') })]);

    expect(formatAmount(r.filledQty)).toBe('1');
    expect(formatAmount(r.unfilledQty)).toBe('9');
  });

  it('picks the highest proceeds on a sell, not the lowest cost', () => {
    // The direction must actually invert the comparison, or every sell routes
    // to the worst venue available.
    const r = route({ side: 'sell', qty: amt('1') }, [
      book({ venue: 'cheap', quoteAmount: amt('90'), feeBps: 0 }),
      book({ venue: 'rich', quoteAmount: amt('110'), feeBps: 0 }),
    ]);

    expect(r.legs[0]!.venue).toBe('rich');
  });

  /**
   * Determinism. Two identical requests must route identically, or a fill
   * becomes unreproducible and no dispute about it can ever be settled.
   */
  it('breaks ties on venue id, not on arrival order', () => {
    const a = book({ venue: 'aaa' });
    const z = book({ venue: 'zzz' });

    expect(route({ side: 'buy', qty: amt('1') }, [z, a]).legs[0]!.venue).toBe('aaa');
    expect(route({ side: 'buy', qty: amt('1') }, [a, z]).legs[0]!.venue).toBe('aaa');
  });

  it('ignores venues with nothing to fill', () => {
    const r = route({ side: 'buy', qty: amt('1') }, [book({ venue: 'empty', fillableQty: 0n }), pool()]);
    expect(r.legs.map((l) => l.venue)).toEqual(['amm-pool']);
  });

  it('returns an empty route rather than throwing when no venue can fill', () => {
    const r = route({ side: 'buy', qty: amt('1') }, []);

    expect(r.legs).toEqual([]);
    expect(formatAmount(r.unfilledQty)).toBe('1');
  });

  it('refuses a non-positive quantity', () => {
    expect(() => route({ side: 'buy', qty: 0n }, [book()])).toThrow(/must be positive/);
  });

  it('preserves 18 decimal places through a split route', () => {
    const dust = '0.000000000000000001';
    const r = route({ side: 'buy', qty: amt(dust) }, [book({ fillableQty: amt(dust), quoteAmount: amt(dust) })]);
    expect(formatAmount(r.filledQty)).toBe(dust);
  });
});
