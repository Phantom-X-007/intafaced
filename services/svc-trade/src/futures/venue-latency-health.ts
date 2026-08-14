/**
 * connect.latency-grading — shipped consumer on svc-trade `/health`.
 *
 * Reports the configured public venue's REST round-trip grade. Does not rank,
 * does not invent a letter for silence, does not 503 `/health` on ungraded.
 * D-S-18: no score → not routing-eligible. Thresholds stay owner-unruled.
 */
import { isGraded, type LatencyGrade, type MarketDataAdapter } from '@intafaced/venue-contracts';

export type VenueLatencyHealth = {
  readonly configured: boolean;
  readonly venueId: string | null;
  readonly grade: LatencyGrade | null;
  /** True only when `isGraded` — ungraded is not a low score. */
  readonly hasScore: boolean;
  readonly reason: 'venue_off' | 'not_gradable' | 'ungraded' | 'measured';
  readonly measurement: 'rest-round-trip' | null;
  readonly samples: number | null;
  readonly p95Ms: number | null;
  readonly provisional: boolean | null;
};

export function presentVenueLatencyHealth(adapter: MarketDataAdapter | null, now: Date = new Date()): VenueLatencyHealth {
  if (!adapter) {
    return {
      configured: false,
      venueId: null,
      grade: null,
      hasScore: false,
      reason: 'venue_off',
      measurement: null,
      samples: null,
      p95Ms: null,
      provisional: null,
    };
  }
  if (typeof adapter.latencyGrade !== 'function') {
    return {
      configured: true,
      venueId: adapter.venue.id,
      grade: null,
      hasScore: false,
      reason: 'not_gradable',
      measurement: null,
      samples: null,
      p95Ms: null,
      provisional: null,
    };
  }
  const g = adapter.latencyGrade(now);
  if (!isGraded(g)) {
    return {
      configured: true,
      venueId: g.venueId,
      grade: null,
      hasScore: false,
      reason: 'ungraded',
      measurement: g.measurement,
      samples: g.samples,
      p95Ms: null,
      provisional: null,
    };
  }
  return {
    configured: true,
    venueId: g.venueId,
    grade: g.grade,
    hasScore: true,
    reason: 'measured',
    measurement: g.measurement,
    samples: g.samples,
    p95Ms: g.p95Ms,
    provisional: g.provisional,
  };
}
