import { describe, expect, it } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client';
import type { MarketDataAdapter, VenueLatencyGrade } from '@intafaced/venue-contracts';
import { liveLatencyScoreMs, scoreSorCost, sorCostTermsFromAdapter, type SorCostTerms } from './cost-model.js';
import { measuredLatencyMs, routingWeightFromGrade, UNMEASURED_LATENCY_MS } from './fabric/latency.js';
import { createVenueMarketDataAdapter, PUBLIC_MARKET_DATA_VENUE_IDS } from './fabric/venues/factory.js';
import { planRoute } from './router.js';
import type { LiquiditySource, QuoteRequest, VenueHealth } from './source.js';

const T0 = new Date('2026-08-14T00:00:00.000Z');

function costs(): { feeBps: number; expectedImpactBps: number; transferCostBps: number } {
  return { feeBps: 10, expectedImpactBps: 0, transferCostBps: 0 };
}

function letterWithoutP95(): VenueLatencyGrade {
  return {
    venueId: 'never-succeeded',
    measurement: 'rest-round-trip',
    grade: 'F',
    provisional: true,
    samples: 2,
    p50Ms: null,
    p95Ms: null,
    rejectRateBps: 0,
    errorRateBps: 10_000,
    staleMs: 0,
    reasons: ['no successful observation in the window'],
  };
}

function sourceFromAdapter(adapter: MarketDataAdapter, price: string): LiquiditySource {
  const id = adapter.venue.id;
  const health: VenueHealth = {
    healthy: true,
    latencyMs: 1,
    lastUpdate: T0,
  };
  return {
    id,
    kind: 'external-cex',
    capabilities: ['quote'],
    health: () => health,
    markets: async () => [],
    quote: async (req: QuoteRequest) => ({
      venueId: id,
      symbol: req.symbol,
      side: req.side,
      amount: amt('1'),
      price: amt(price),
      feeBps: 0,
      expiresAt: new Date(T0.getTime() + 30_000),
    }),
    orderBook: async () => ({}) as never,
    submit: async () => {
      throw new Error('market-data connection does not claim a trading path');
    },
  };
}

describe('D26-P1-X2 — never-run adapter gets zero routing weight', () => {
  it('factory adapters that have never run are weight 0 through the cost-model door', async () => {
    for (const venueId of PUBLIC_MARKET_DATA_VENUE_IDS) {
      const adapter = createVenueMarketDataAdapter(venueId);
      expect(adapter).not.toBeNull();
      if (!adapter) continue;

      const terms = sorCostTermsFromAdapter(adapter, costs(), T0);
      expect(terms.latencyGrade?.grade).toBeNull();
      expect(terms.latencyGrade?.p95Ms).toBeNull();
      expect(liveLatencyScoreMs(terms.latencyGrade)).toBeNull();
      expect(liveLatencyScoreMs(terms.latencyGrade)).not.toBe(0);
      expect(liveLatencyScoreMs(terms.latencyGrade)).not.toBe(UNMEASURED_LATENCY_MS);
      expect(routingWeightFromGrade(terms.latencyGrade!)).toBe(0);

      const scored = scoreSorCost(terms);
      expect(scored.ok).toBe(false);
      if (scored.ok) return;
      expect(scored.routingWeight).toBe(0);
      expect(scored.reason).toBe('unscored_latency');

      const plan = await planRoute({ symbol: 'BTC/USDT', side: 'buy', amount: amt('1') }, [sourceFromAdapter(adapter, '1')], {
        now: T0,
        costTermsByVenue: { [adapter.venue.id]: terms },
      });

      expect(plan.legs).toEqual([]);
      expect(plan.routedAmount).toBe(0n);
      expect(plan.rejected.find((r) => r.venueId === adapter.venue.id)?.reason).toBe('zero_weight');
    }
  });

  it('a letter without p95 is not a live score — cost model weight 0', () => {
    const grade = letterWithoutP95();
    expect(measuredLatencyMs(grade)).toBeNull();
    expect(liveLatencyScoreMs(grade)).toBeNull();
    expect(routingWeightFromGrade(grade)).toBe(0);

    const terms: SorCostTerms = { ...costs(), latencyGrade: grade };
    const scored = scoreSorCost(terms);
    expect(scored).toMatchObject({ ok: false, routingWeight: 0, reason: 'unscored_latency' });
  });

  it('null grade through liveLatencyScoreMs is absence, not 0ms', () => {
    expect(liveLatencyScoreMs(null)).toBeNull();
  });
});
