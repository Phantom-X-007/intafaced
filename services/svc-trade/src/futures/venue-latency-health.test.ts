import { describe, expect, it } from 'vitest';
import { BinanceSpotMarketData, routingWeightFromGrade } from '@intafaced/venue-adapter';
import type { MarketDataAdapter, VenueLatencyGrade } from '@intafaced/venue-contracts';
import { presentVenueLatencyHealth } from './venue-latency-health.js';

const venue = {
  id: 'binance-spot',
  displayName: 'Binance spot',
  kind: 'external-cex' as const,
  sequencedDepth: true,
};

function ungraded(): VenueLatencyGrade {
  return {
    venueId: 'binance-spot',
    measurement: 'rest-round-trip',
    grade: null,
    samples: 0,
    p50Ms: null,
    p95Ms: null,
    rejectRateBps: null,
    errorRateBps: null,
    staleMs: null,
    provisional: false,
    reasons: [],
  };
}

function gradedA(): VenueLatencyGrade {
  return {
    ...ungraded(),
    grade: 'A',
    samples: 12,
    p50Ms: 40,
    p95Ms: 80,
    rejectRateBps: 0,
    errorRateBps: 0,
    staleMs: 10,
    provisional: false,
    reasons: ['p95'],
  };
}

/** Letter without a live p95 — answering in errors is not a latency score (#1843). */
function letterWithoutP95(): VenueLatencyGrade {
  return {
    ...ungraded(),
    grade: 'F',
    samples: 4,
    p50Ms: null,
    p95Ms: null,
    rejectRateBps: 0,
    errorRateBps: 10_000,
    staleMs: 10,
    provisional: true,
    reasons: ['no successful round-trip'],
  };
}

describe('presentVenueLatencyHealth', () => {
  it('venue off is unconfigured, not a failing grade', () => {
    const h = presentVenueLatencyHealth(null);
    expect(h.configured).toBe(false);
    expect(h.grade).toBeNull();
    expect(h.hasScore).toBe(false);
    expect(h.routingWeight).toBe(0);
    expect(h.reason).toBe('venue_off');
  });

  it('adapter without latencyGrade is wiring, not a venue F', () => {
    const adapter = { venue } as MarketDataAdapter;
    const h = presentVenueLatencyHealth(adapter);
    expect(h.reason).toBe('not_gradable');
    expect(h.grade).toBeNull();
    expect(h.hasScore).toBe(false);
    expect(h.routingWeight).toBe(0);
    expect(h.venueId).toBe('binance-spot');
  });

  it('zero observations stay ungraded — D-S-18', () => {
    const adapter = {
      venue,
      latencyGrade: () => ungraded(),
    } as MarketDataAdapter;
    const h = presentVenueLatencyHealth(adapter);
    expect(h.reason).toBe('ungraded');
    expect(h.grade).toBeNull();
    expect(h.hasScore).toBe(false);
    expect(h.routingWeight).toBe(0);
  });

  it('a letter without live p95 is weight 0 — not ranked as scored', () => {
    const grade = letterWithoutP95();
    expect(routingWeightFromGrade(grade)).toBe(0);
    const adapter = {
      venue,
      latencyGrade: () => grade,
    } as MarketDataAdapter;
    const h = presentVenueLatencyHealth(adapter);
    expect(h.hasScore).toBe(false);
    expect(h.routingWeight).toBe(0);
    expect(h.grade).toBeNull();
    expect(h.p95Ms).toBeNull();
    expect(h.reason).toBe('unscored');
  });

  it('a never-run factory adapter does not rank as scored', () => {
    const adapter = new BinanceSpotMarketData();
    const grade = adapter.latencyGrade!(new Date(0));
    expect(routingWeightFromGrade(grade)).toBe(0);
    const h = presentVenueLatencyHealth(adapter, new Date(0));
    expect(h.hasScore).toBe(false);
    expect(h.routingWeight).toBe(0);
    expect(h.grade).toBeNull();
    expect(h.p95Ms).toBeNull();
    expect(h.reason).toBe('ungraded');
  });

  it('measured grade is reported without inventing a second scorer', () => {
    const adapter = {
      venue,
      latencyGrade: () => gradedA(),
    } as MarketDataAdapter;
    const h = presentVenueLatencyHealth(adapter);
    expect(h.reason).toBe('measured');
    expect(h.grade).toBe('A');
    expect(h.hasScore).toBe(true);
    expect(h.routingWeight).toBe(1);
    expect(h.p95Ms).toBe(80);
    expect(h.samples).toBe(12);
  });
});
