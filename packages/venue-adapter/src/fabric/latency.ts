import type { VenueHealth } from '../source.js';

/**
 * LATENCY GRADING — §27's "every adapter continuously scored — round-trip, book
 * staleness, reject rates — feeding execution routing weights live".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT A GRADE IS FOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A venue does not fail cleanly. It gets slow, then it gets slower, then some
 * requests start being rejected, and long before it is "down" it has become the
 * wrong venue to send an order to. Health as a boolean cannot express any of
 * that, so a fabric with only a boolean discovers the degradation by routing
 * into it.
 *
 * The grade is the continuous version of the boolean, and it is deliberately
 * computed from three independent signals, because each catches a failure the
 * others miss:
 *
 *   · **Round-trip p95, not the mean.** The mean is dominated by the fast
 *     majority; the tail is what an order actually experiences when it matters.
 *     A venue with a 30ms mean and a 4s p95 is a venue that will hang on the
 *     one request you cannot afford to have hang.
 *   · **Reject rate.** A venue answering fast and refusing half of what it is
 *     sent is worse than a slow one that works, and pure latency scores it
 *     top of the list.
 *   · **Staleness.** The failure that actually costs money: a venue that has
 *     stopped updating still answers, still quotes, and still looks fine — right
 *     up until the fill comes back at a price from thirty seconds ago.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `provisional` — THE HONEST PART
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Two samples do not make a p95. A grader that answered "A" on the strength of
 * two fast reads would be inventing confidence, and the router would act on it.
 * So a grade computed from fewer than `minSamples` observations is marked
 * `provisional`, and a caller that is about to move money can refuse to weight
 * on it. The grade is still returned — an honest weak signal beats no signal —
 * but it is labelled.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW IT FEEDS ROUTING, WITHOUT BREAKING BEST EXECUTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The grade does NOT adjust prices. `router.ts` ranks on effective price, and
 * `internalPreference` is the ONE documented thumb on that scale; a second,
 * latency-shaped thumb would quietly become a way to prefer whichever venue we
 * happened to be measuring favourably.
 *
 * What it does instead is set `VenueHealth` — `healthy` and `latencyMs` — which
 * the existing router already consumes: an unhealthy venue is EXCLUDED AND
 * REPORTED in `RoutePlan.rejected` (§27's requirement, exactly), and `latencyMs`
 * breaks ties between venues at the same price. That is the whole wiring, and
 * it is one function: `healthFromGrade`.
 */

export type LatencyGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export type ObservationOutcome =
  /** Answered with usable data. */
  | 'ok'
  /** Answered, and said no. A rejected order, a refused subscription. */
  | 'reject'
  /** Did not answer usefully: timeout, socket close, non-2xx, malformed payload. */
  | 'error';

export interface LatencyObservation {
  readonly roundTripMs: number;
  readonly outcome: ObservationOutcome;
  readonly at: Date;
}

export interface LatencyThresholds {
  /** p95 round-trip ceilings, in ms, for grades A/B/C/D. Above the last is F. */
  readonly p95Ms: readonly [a: number, b: number, c: number, d: number];
  /** Reject-rate ceilings in bps for grades A/B/C/D. */
  readonly rejectBps: readonly [a: number, b: number, c: number, d: number];
  /** Data older than this is an automatic F, whatever the latency looks like. */
  readonly maxStalenessMs: number;
  /** Below this, the grade is `provisional`. */
  readonly minSamples: number;
}

export const DEFAULT_THRESHOLDS: LatencyThresholds = {
  p95Ms: [150, 400, 1_000, 3_000],
  rejectBps: [50, 200, 1_000, 3_000],
  maxStalenessMs: 5_000,
  minSamples: 10,
};

export interface VenueLatencyGrade {
  readonly venueId: string;
  readonly grade: LatencyGrade;
  readonly samples: number;
  /** `null` with no successful samples — not zero, which reads as "instant". */
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly rejectRateBps: number;
  readonly errorRateBps: number;
  /** Since the last observation of any kind. `null` before the first one. */
  readonly staleMs: number | null;
  /** True when there are too few samples for the grade to mean much. See the header. */
  readonly provisional: boolean;
  /** Every reason the grade is not an A, in the order they were applied. */
  readonly reasons: readonly string[];
}

/**
 * A rolling window of observations for one venue.
 *
 * Bounded by BOTH count and age. Count alone lets a venue that went quiet keep a
 * grade earned an hour ago; age alone lets a busy venue accumulate without
 * limit. Neither bound is optional for that reason.
 */
export class VenueLatencyGrader {
  readonly venueId: string;
  readonly #thresholds: LatencyThresholds;
  readonly #maxSamples: number;
  readonly #maxAgeMs: number;
  #window: LatencyObservation[] = [];
  #lastObservedAt: Date | null = null;

  constructor(venueId: string, options: { thresholds?: LatencyThresholds; maxSamples?: number; maxAgeMs?: number } = {}) {
    this.venueId = venueId;
    this.#thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
    this.#maxSamples = options.maxSamples ?? 200;
    this.#maxAgeMs = options.maxAgeMs ?? 60_000;
  }

  observe(observation: LatencyObservation): void {
    this.#window.push(observation);
    this.#lastObservedAt = observation.at;
    this.#evict(observation.at);
  }

  /** Convenience for the common case: time a call and record the outcome. */
  async time<T>(call: () => Promise<T>, clock: () => number = Date.now): Promise<T> {
    const started = clock();
    try {
      const result = await call();
      this.observe({ roundTripMs: clock() - started, outcome: 'ok', at: new Date(clock()) });
      return result;
    } catch (error) {
      this.observe({ roundTripMs: clock() - started, outcome: 'error', at: new Date(clock()) });
      throw error;
    }
  }

  grade(now: Date = new Date()): VenueLatencyGrade {
    this.#evict(now);

    const samples = this.#window.length;
    const staleMs = this.#lastObservedAt ? now.getTime() - this.#lastObservedAt.getTime() : null;
    const successes = this.#window
      .filter((o) => o.outcome === 'ok')
      .map((o) => o.roundTripMs)
      .sort((a, b) => a - b);
    const rejects = this.#window.filter((o) => o.outcome === 'reject').length;
    const errors = this.#window.filter((o) => o.outcome === 'error').length;

    const rejectRateBps = samples === 0 ? 0 : Math.round((rejects / samples) * 10_000);
    const errorRateBps = samples === 0 ? 0 : Math.round((errors / samples) * 10_000);
    const p50Ms = percentile(successes, 50);
    const p95Ms = percentile(successes, 95);

    const reasons: string[] = [];
    let grade: LatencyGrade = 'A';

    // Never observed at all is F, not A. An absence of bad news about a venue we
    // have never spoken to is not evidence that it works.
    if (samples === 0) {
      return {
        venueId: this.venueId,
        grade: 'F',
        samples: 0,
        p50Ms: null,
        p95Ms: null,
        rejectRateBps: 0,
        errorRateBps: 0,
        staleMs,
        provisional: true,
        reasons: ['no observations in the window — never graded, not graded good'],
      };
    }

    if (staleMs !== null && staleMs > this.#thresholds.maxStalenessMs) {
      reasons.push(`last observation ${staleMs}ms ago, ceiling ${this.#thresholds.maxStalenessMs}ms`);
      grade = 'F';
    }

    if (p95Ms === null) {
      // Answering, but nothing has succeeded. Latency is irrelevant.
      reasons.push('no successful observation in the window');
      grade = 'F';
    } else {
      const latencyGrade = gradeFor(p95Ms, this.#thresholds.p95Ms);
      if (latencyGrade !== 'A') reasons.push(`p95 round-trip ${p95Ms}ms`);
      grade = worse(grade, latencyGrade);
    }

    const rejectGrade = gradeFor(rejectRateBps, this.#thresholds.rejectBps);
    if (rejectGrade !== 'A') reasons.push(`reject rate ${bpsToPercent(rejectRateBps)}`);
    grade = worse(grade, rejectGrade);

    const errorGrade = gradeFor(errorRateBps, this.#thresholds.rejectBps);
    if (errorGrade !== 'A') reasons.push(`error rate ${bpsToPercent(errorRateBps)}`);
    grade = worse(grade, errorGrade);

    return {
      venueId: this.venueId,
      grade,
      samples,
      p50Ms,
      p95Ms,
      rejectRateBps,
      errorRateBps,
      staleMs,
      provisional: samples < this.#thresholds.minSamples,
      reasons,
    };
  }

  #evict(now: Date): void {
    const cutoff = now.getTime() - this.#maxAgeMs;
    this.#window = this.#window.filter((o) => o.at.getTime() >= cutoff);
    if (this.#window.length > this.#maxSamples) {
      this.#window = this.#window.slice(this.#window.length - this.#maxSamples);
    }
  }
}

/**
 * Turn a grade into the `VenueHealth` the router already consumes.
 *
 * This is the entire "feeding routing weights live" wiring, and it is one
 * function on purpose. An `F` becomes `healthy: false`, which the router turns
 * into a `RejectedVenue` with a reason — §27's "excluded and reported", using
 * machinery that already exists rather than a parallel path that could disagree
 * with it.
 *
 * `latencyMs` carries p95, not p50 or the mean. The router uses it to break ties
 * at equal price, and the venue you want at equal price is the one whose SLOW
 * requests are least slow.
 *
 * A `provisional` grade is never allowed to mark a venue unhealthy on its own:
 * excluding a venue on two samples would take real liquidity off the router for
 * no evidence. It can still be F for staleness, which needs no sample count.
 */
export function healthFromGrade(grade: VenueLatencyGrade, lastUpdate: Date): VenueHealth {
  const failing = grade.grade === 'F';
  // A grade built on too little data may not exclude a venue on its own — but a
  // grader with NO samples has not measured anything, and "unmeasured" is not
  // "healthy". That case stays excluded.
  const trusted = !grade.provisional || grade.samples === 0;

  return {
    healthy: !(failing && trusted),
    latencyMs: grade.p95Ms ?? Number.MAX_SAFE_INTEGER,
    lastUpdate,
    reason: grade.reasons.length > 0 ? `grade ${grade.grade}: ${grade.reasons.join('; ')}` : undefined,
  };
}

/** Every graded venue in one place, so a health endpoint has one thing to read. */
export class LatencyGradeRegistry {
  readonly #graders = new Map<string, VenueLatencyGrader>();
  readonly #options: { thresholds?: LatencyThresholds; maxSamples?: number; maxAgeMs?: number };

  constructor(options: { thresholds?: LatencyThresholds; maxSamples?: number; maxAgeMs?: number } = {}) {
    this.#options = options;
  }

  /** Creates on first use — a venue we have not measured yet still needs somewhere to record. */
  for(venueId: string): VenueLatencyGrader {
    let grader = this.#graders.get(venueId);
    if (!grader) {
      grader = new VenueLatencyGrader(venueId, this.#options);
      this.#graders.set(venueId, grader);
    }
    return grader;
  }

  gradeAll(now: Date = new Date()): VenueLatencyGrade[] {
    return [...this.#graders.values()].map((grader) => grader.grade(now));
  }
}

// ──────────────────────────────────────────────────────────────────────────────

/** Nearest-rank percentile over a pre-sorted array. `null` when empty. */
function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? null;
}

/** First threshold the value clears. Thresholds are ceilings, ascending. */
function gradeFor(value: number, thresholds: readonly [number, number, number, number]): LatencyGrade {
  if (value <= thresholds[0]) return 'A';
  if (value <= thresholds[1]) return 'B';
  if (value <= thresholds[2]) return 'C';
  if (value <= thresholds[3]) return 'D';
  return 'F';
}

const ORDER: readonly LatencyGrade[] = ['A', 'B', 'C', 'D', 'F'];

/** The worse of two grades. A venue is as good as its weakest signal, not its best. */
function worse(a: LatencyGrade, b: LatencyGrade): LatencyGrade {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}
