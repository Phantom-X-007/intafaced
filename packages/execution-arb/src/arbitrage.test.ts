import { describe, expect, it } from 'vitest';
import { type Amount, formatAmount, parseAmount as amt } from '@intafaced/ledger-client';
import type { SorCostTerms, VenueKind } from '@intafaced/venue-adapter';
import type { VenueLatencyGrade } from '@intafaced/venue-contracts';
import { isExternalVenueKind, scanExternalCrossExchangeArb, type ArbVenueQuote } from './arbitrage.js';

function graded(letter: 'A' | 'B' | 'C' | 'D' | 'F' = 'A'): VenueLatencyGrade {
  return {
    venueId: 'v',
    measurement: 'rest-round-trip',
    grade: letter,
    provisional: false,
    samples: 20,
    p50Ms: 30,
    p95Ms: 40,
    rejectRateBps: 0,
    errorRateBps: 0,
    staleMs: 0,
    reasons: [],
  };
}

function ungraded(): VenueLatencyGrade {
  return {
    venueId: 'v',
    measurement: 'rest-round-trip',
    grade: null,
    provisional: false,
    samples: 0,
    p50Ms: null,
    p95Ms: null,
    rejectRateBps: null,
    errorRateBps: null,
    staleMs: null,
    reasons: ['no observations'],
  };
}

function completeTerms(over: Partial<SorCostTerms> = {}): SorCostTerms {
  return {
    feeBps: 5,
    expectedImpactBps: 2,
    transferCostBps: 1,
    latencyGrade: graded(),
    ...over,
  };
}

function q(over: { venueId: string; kind: VenueKind; price: string; amount?: Amount }): ArbVenueQuote {
  return {
    venueId: over.venueId,
    kind: over.kind,
    price: amt(over.price),
    amount: over.amount ?? amt('1'),
  };
}

describe('isExternalVenueKind — D26-P0-01', () => {
  it('treats internal as non-external', () => {
    expect(isExternalVenueKind('internal')).toBe(false);
    expect(isExternalVenueKind('external-cex')).toBe(true);
    expect(isExternalVenueKind('external-dex')).toBe(true);
  });
});

describe('scanExternalCrossExchangeArb — D26-P1-X4', () => {
  it('emits external CEX↔CEX opportunity when all-in edge is positive and inventory ready', () => {
    const result = scanExternalCrossExchangeArb({
      symbol: 'BTC/USDT',
      amount: amt('1'),
      quotes: [q({ venueId: 'binance', kind: 'external-cex', price: '100' }), q({ venueId: 'bybit', kind: 'external-cex', price: '101' })],
      costTermsByVenue: {
        binance: completeTerms({ feeBps: 5, expectedImpactBps: 0, transferCostBps: 0 }),
        bybit: completeTerms({ feeBps: 5, expectedImpactBps: 0, transferCostBps: 0 }),
      },
      inventory: { prePositionedByVenue: { binance: true, bybit: true } },
    });

    // buy binance @100 all-in 100.05; sell bybit @101 all-in 100.9495… → positive edge
    expect(result.opportunities.length).toBe(1);
    const opp = result.opportunities[0]!;
    expect(opp.buyVenueId).toBe('binance');
    expect(opp.sellVenueId).toBe('bybit');
    expect(opp.edgePerUnit > 0n).toBe(true);
    expect(formatAmount(opp.buyAllIn)).toBe('100.05');
  });

  it('refuses internal house venue legs (external-only seal)', () => {
    const result = scanExternalCrossExchangeArb({
      symbol: 'BTC/USDT',
      amount: amt('1'),
      quotes: [q({ venueId: 'house', kind: 'internal', price: '99' }), q({ venueId: 'binance', kind: 'external-cex', price: '101' })],
      costTermsByVenue: {
        house: completeTerms(),
        binance: completeTerms(),
      },
      inventory: { prePositionedByVenue: { house: true, binance: true } },
    });

    expect(result.opportunities).toHaveLength(0);
    expect(result.refused.some((r) => r.reason === 'internal_venue')).toBe(true);
  });

  it('unscored latency → zero_weight (no invent)', () => {
    const result = scanExternalCrossExchangeArb({
      symbol: 'BTC/USDT',
      amount: amt('1'),
      quotes: [q({ venueId: 'a', kind: 'external-cex', price: '100' }), q({ venueId: 'b', kind: 'external-cex', price: '102' })],
      costTermsByVenue: {
        a: completeTerms({ latencyGrade: ungraded() }),
        b: completeTerms(),
      },
      inventory: { prePositionedByVenue: { a: true, b: true } },
    });

    expect(result.opportunities).toHaveLength(0);
    expect(result.refused.some((r) => r.reason === 'zero_weight' && r.detail.includes('buy leg'))).toBe(true);
  });

  it('missing fee → incomplete_cost rather than assume 0', () => {
    const result = scanExternalCrossExchangeArb({
      symbol: 'BTC/USDT',
      amount: amt('1'),
      quotes: [q({ venueId: 'a', kind: 'external-cex', price: '100' }), q({ venueId: 'b', kind: 'external-cex', price: '102' })],
      costTermsByVenue: {
        a: completeTerms({ feeBps: null }),
        b: completeTerms(),
      },
      inventory: { prePositionedByVenue: { a: true, b: true } },
    });

    expect(result.refused.some((r) => r.reason === 'incomplete_cost')).toBe(true);
    expect(result.opportunities).toHaveLength(0);
  });

  it('missing cost terms map entry refuses', () => {
    const result = scanExternalCrossExchangeArb({
      symbol: 'BTC/USDT',
      amount: amt('1'),
      quotes: [q({ venueId: 'a', kind: 'external-cex', price: '100' }), q({ venueId: 'b', kind: 'external-cex', price: '102' })],
      costTermsByVenue: {
        a: completeTerms(),
      },
      inventory: { prePositionedByVenue: { a: true, b: true } },
    });

    expect(result.refused.some((r) => r.reason === 'missing_cost_terms')).toBe(true);
  });

  it('DEX↔CEX without inventory both sides → bridge_fantasy', () => {
    const result = scanExternalCrossExchangeArb({
      symbol: 'BTC/USDT',
      amount: amt('1'),
      quotes: [q({ venueId: 'dex', kind: 'external-dex', price: '100' }), q({ venueId: 'cex', kind: 'external-cex', price: '102' })],
      costTermsByVenue: {
        dex: completeTerms({ feeBps: 0, expectedImpactBps: 0, transferCostBps: 0 }),
        cex: completeTerms({ feeBps: 0, expectedImpactBps: 0, transferCostBps: 0 }),
      },
      inventory: { prePositionedByVenue: { dex: true, cex: false } },
    });

    expect(result.opportunities).toHaveLength(0);
    expect(result.refused.some((r) => r.reason === 'bridge_fantasy')).toBe(true);
  });

  it('DEX↔CEX with inventory both sides can emit when edge positive', () => {
    const result = scanExternalCrossExchangeArb({
      symbol: 'BTC/USDT',
      amount: amt('1'),
      quotes: [q({ venueId: 'dex', kind: 'external-dex', price: '100' }), q({ venueId: 'cex', kind: 'external-cex', price: '102' })],
      costTermsByVenue: {
        dex: completeTerms({ feeBps: 0, expectedImpactBps: 0, transferCostBps: 0 }),
        cex: completeTerms({ feeBps: 0, expectedImpactBps: 0, transferCostBps: 0 }),
      },
      inventory: { prePositionedByVenue: { dex: true, cex: true } },
    });

    expect(result.opportunities.some((o) => o.buyVenueId === 'dex' && o.sellVenueId === 'cex')).toBe(true);
  });

  it('CEX↔CEX without inventory → inventory_missing (not sized on implied transfer)', () => {
    const result = scanExternalCrossExchangeArb({
      symbol: 'BTC/USDT',
      amount: amt('1'),
      quotes: [q({ venueId: 'a', kind: 'external-cex', price: '100' }), q({ venueId: 'b', kind: 'external-cex', price: '102' })],
      costTermsByVenue: {
        a: completeTerms({ feeBps: 0, expectedImpactBps: 0, transferCostBps: 0 }),
        b: completeTerms({ feeBps: 0, expectedImpactBps: 0, transferCostBps: 0 }),
      },
      inventory: { prePositionedByVenue: { a: true } },
    });

    expect(result.opportunities).toHaveLength(0);
    expect(result.refused.some((r) => r.reason === 'inventory_missing')).toBe(true);
  });

  it('refuses no_edge when all-in costs erase the spread', () => {
    // raw 10 bps spread, 20 bps all-in each side → no edge
    const result = scanExternalCrossExchangeArb({
      symbol: 'BTC/USDT',
      amount: amt('1'),
      quotes: [q({ venueId: 'a', kind: 'external-cex', price: '100' }), q({ venueId: 'b', kind: 'external-cex', price: '100.1' })],
      costTermsByVenue: {
        a: completeTerms({ feeBps: 20, expectedImpactBps: 0, transferCostBps: 0 }),
        b: completeTerms({ feeBps: 20, expectedImpactBps: 0, transferCostBps: 0 }),
      },
      inventory: { prePositionedByVenue: { a: true, b: true } },
    });

    expect(result.opportunities).toHaveLength(0);
    expect(result.refused.some((r) => r.reason === 'no_edge')).toBe(true);
  });

  it('insufficient quoted size refuses rather than inventing depth', () => {
    const result = scanExternalCrossExchangeArb({
      symbol: 'BTC/USDT',
      amount: amt('2'),
      quotes: [
        q({ venueId: 'a', kind: 'external-cex', price: '100', amount: amt('1') }),
        q({ venueId: 'b', kind: 'external-cex', price: '102', amount: amt('2') }),
      ],
      costTermsByVenue: {
        a: completeTerms({ feeBps: 0, expectedImpactBps: 0, transferCostBps: 0 }),
        b: completeTerms({ feeBps: 0, expectedImpactBps: 0, transferCostBps: 0 }),
      },
      inventory: { prePositionedByVenue: { a: true, b: true } },
    });

    expect(result.refused.some((r) => r.reason === 'insufficient_size')).toBe(true);
  });
});
