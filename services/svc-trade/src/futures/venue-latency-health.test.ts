import { describe, expect, it } from 'vitest';
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

describe('presentVenueLatencyHealth', () => {
  it('venue off is unconfigured, not a failing grade', () => {
    const h = presentVenueLatencyHealth(null);
    expect(h.configured).toBe(false);
    expect(h.grade).toBeNull();
    expect(h.hasScore).toBe(false);
    expect(h.reason).toBe('venue_off');
  });

  it('adapter without latencyGrade is wiring, not a venue F', () => {
    const adapter = { venue } as MarketDataAdapter;
    const h = presentVenueLatencyHealth(adapter);
    expect(h.reason).toBe('not_gradable');
    expect(h.grade).toBeNull();
    expect(h.hasScore).toBe(false);
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
  });

  it('measured grade is reported without inventing routing weights', () => {
    const adapter = {
      venue,
      latencyGrade: () => gradedA(),
    } as MarketDataAdapter;
    const h = presentVenueLatencyHealth(adapter);
    expect(h.reason).toBe('measured');
    expect(h.grade).toBe('A');
    expect(h.hasScore).toBe(true);
    expect(h.p95Ms).toBe(80);
    expect(h.samples).toBe(12);
  });
});
