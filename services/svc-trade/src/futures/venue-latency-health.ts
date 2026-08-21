/**
 * connect.latency-grading — shipped consumer on svc-trade `/health`.
 *
 * Reports the configured public venue's REST round-trip grade. Does not invent
 * a letter for silence, does not 503 `/health` on ungraded. Eligibility uses
 * Connect fabric `routingWeightFromGrade` (D26-P1-X2 / #1843) — a letter with
 * no live p95 is weight **zero**, not a score. D-S-18: no score → not
 * routing-eligible. Thresholds stay owner-unruled. No second fabric scorer.
 *
 * Stream-first MaintainedBook (`TRADE_VENUE_MARK_STREAM`) stays default OFF.
 * REST grade is not a WS-stream grade.
 */
import { routingWeightFromGrade } from '@intafaced/venue-adapter';
import { isGraded, type LatencyGrade, type MarketDataAdapter } from '@intafaced/venue-contracts';

export type VenueLatencyHealth = {
  readonly configured: boolean;
  readonly venueId: string | null;
  readonly grade: LatencyGrade | null;
  /** True only when the fabric score-feed weight is 1 — ungraded / no p95 is not a low score. */
  readonly hasScore: boolean;
  /** Same gate as `routingWeightFromGrade`. Unmeasured adapters are 0, never ranked as scored. */
  readonly routingWeight: 0 | 1;
  readonly reason: 'venue_off' | 'not_gradable' | 'ungraded' | 'unscored' | 'measured';
  readonly measurement: 'rest-round-trip' | null;
  /** True only when the host enabled TRADE_VENUE_MARK_STREAM. REST p95 is not a stream. */
  readonly streamEnabled: boolean;
  readonly streamDefault: false;
  readonly samples: number | null;
  readonly p95Ms: number | null;
  readonly provisional: boolean | null;
};

function zeroWeight(
  partial: {
    configured: boolean;
    venueId: string | null;
    reason: VenueLatencyHealth['reason'];
    measurement: VenueLatencyHealth['measurement'];
    samples: number | null;
    provisional: boolean | null;
  },
  streamEnabled: boolean,
): VenueLatencyHealth {
  return {
    ...partial,
    grade: null,
    hasScore: false,
    routingWeight: 0,
    p95Ms: null,
    streamEnabled: streamEnabled === true,
    streamDefault: false,
  };
}

export function presentVenueLatencyHealth(
  adapter: MarketDataAdapter | null,
  now: Date = new Date(),
  flags: { readonly streamEnabled?: boolean } = {},
): VenueLatencyHealth {
  const streamEnabled = flags.streamEnabled === true;
  if (!adapter) {
    return zeroWeight(
      {
        configured: false,
        venueId: null,
        reason: 'venue_off',
        measurement: null,
        samples: null,
        provisional: null,
      },
      streamEnabled,
    );
  }
  if (typeof adapter.latencyGrade !== 'function') {
    return zeroWeight(
      {
        configured: true,
        venueId: adapter.venue.id,
        reason: 'not_gradable',
        measurement: null,
        samples: null,
        provisional: null,
      },
      streamEnabled,
    );
  }
  const g = adapter.latencyGrade(now);
  if (routingWeightFromGrade(g) === 0 || !isGraded(g) || g.p95Ms === null) {
    return zeroWeight(
      {
        configured: true,
        venueId: g.venueId,
        reason: isGraded(g) ? 'unscored' : 'ungraded',
        measurement: g.measurement,
        samples: g.samples,
        provisional: isGraded(g) ? g.provisional : null,
      },
      streamEnabled,
    );
  }
  return {
    configured: true,
    venueId: g.venueId,
    grade: g.grade,
    hasScore: true,
    routingWeight: 1,
    reason: 'measured',
    measurement: g.measurement,
    streamEnabled,
    streamDefault: false,
    samples: g.samples,
    p95Ms: g.p95Ms,
    provisional: g.provisional,
  };
}
