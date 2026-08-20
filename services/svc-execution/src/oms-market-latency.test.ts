import { describe, expect, it } from 'vitest';
import type { MarketDataAdapter, VenueLatencyGrade } from '@intafaced/venue-contracts';
import { marketDataAdapterLatency } from './oms-market-latency.js';

function ungraded(over: Partial<VenueLatencyGrade> = {}): VenueLatencyGrade {
  return {
    venueId: 'street',
    measurement: 'rest-round-trip',
    grade: null,
    samples: 0,
    p50Ms: null,
    p95Ms: null,
    rejectRateBps: null,
    errorRateBps: null,
    staleMs: null,
    provisional: false,
    reasons: ['no observations in window'],
    ...over,
  };
}

function adapter(over: Partial<MarketDataAdapter> = {}): MarketDataAdapter {
  return {
    venue: { id: 'street', displayName: 'Street', kind: 'external-cex', sequencedDepth: true },
    markets: async () => [],
    snapshotBook: async () => {
      throw new Error('snapshot unused');
    },
    streamBook: async () => {
      throw new Error('stream unused');
    },
    ...over,
  };
}

describe('marketDataAdapterLatency', () => {
  it('forwards latencyGrade without rewriting a null grade as F', () => {
    const observe = marketDataAdapterLatency(
      adapter({
        latencyGrade: () => ungraded(),
      }),
    );
    const result = observe();
    expect(result.grade).toBeNull();
    expect(result.samples).toBe(0);
    expect(result.rejectRateBps).toBeNull();
  });

  it('throws when the adapter has no latencyGrade method — does not invent F', () => {
    const observe = marketDataAdapterLatency(adapter());
    expect(() => observe()).toThrow(/latencyGrade is not wired/);
  });

  it('forwards the injected clock', () => {
    const now = new Date('2026-08-17T12:00:00.000Z');
    let seen: Date | undefined;
    const observe = marketDataAdapterLatency(
      adapter({
        latencyGrade: (clock) => {
          seen = clock;
          return ungraded({ grade: 'C', samples: 8, p50Ms: 200, p95Ms: 400, rejectRateBps: 0, errorRateBps: 0 });
        },
      }),
    );
    expect(observe(now).grade).toBe('C');
    expect(seen).toBe(now);
  });
});
