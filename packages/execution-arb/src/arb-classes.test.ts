import { describe, expect, it } from 'vitest';
import { CROSS_EXCHANGE_DEFAULT_MID, CROSS_EXCHANGE_DEFAULT_SPREAD_BPS } from './arbitrage.js';
import { EMPTY_BOOK_REFUSE, scanArbClass } from './arb-classes.js';

describe('arb class scanners — empty books refuse, never invent bps', () => {
  it('pins default mid/spread as null so a later +DEFAULT cannot compile', () => {
    expect(CROSS_EXCHANGE_DEFAULT_MID).toBeNull();
    expect(CROSS_EXCHANGE_DEFAULT_SPREAD_BPS).toBeNull();
  });

  it.each(['cross-exchange', 'triangular', 'basis', 'funding'] as const)('%s empty quotes refuse missing_quote', (scanClass) => {
    const result = scanArbClass({
      scanClass,
      symbol: 'BTC/USDT',
      amount: 1n,
      quotes: [],
      costTermsByVenue: {},
      inventory: { prePositionedByVenue: {} },
      nowMs: 1,
      maxQuoteAgeMs: 1_000,
    });
    expect(result.opportunities).toEqual([]);
    expect(result.refused[0]?.reason).toBe('missing_quote');
    expect(result.refused[0]?.detail).toBe(EMPTY_BOOK_REFUSE);
  });

  it('triangular with two legs refuses rather than inventing a third book', () => {
    const result = scanArbClass({
      scanClass: 'triangular',
      symbol: 'BTC/USDT',
      amount: 1n,
      quotes: [
        { venueId: 'a', kind: 'external-cex', price: 100n, amount: 1n, asOfMs: 1 },
        { venueId: 'b', kind: 'external-cex', price: 101n, amount: 1n, asOfMs: 1 },
      ],
      costTermsByVenue: {},
      inventory: { prePositionedByVenue: { a: true, b: true } },
      nowMs: 1,
      maxQuoteAgeMs: 1_000,
    });
    expect(result.opportunities).toEqual([]);
    expect(result.refused[0]?.reason).toBe('missing_quote');
    expect(result.refused[0]?.detail).toMatch(/three/);
  });

  it('funding without a caller rate refuses rather than inventing bps', () => {
    const result = scanArbClass({
      scanClass: 'funding',
      symbol: 'BTC/USDT',
      amount: 1n,
      quotes: [{ venueId: 'a', kind: 'external-cex', price: 100n, amount: 1n, asOfMs: 1 }],
      costTermsByVenue: {},
      inventory: { prePositionedByVenue: { a: true } },
      nowMs: 1,
      maxQuoteAgeMs: 1_000,
      fundingRate: null,
    });
    expect(result.opportunities).toEqual([]);
    expect(result.refused[0]?.detail).toMatch(/caller-supplied rate/);
  });
});
