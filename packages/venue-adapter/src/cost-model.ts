import { type Amount, add, mulBps, sub } from '@intafaced/ledger-client';
import { isGraded, type MarketDataAdapter, type VenueLatencyGrade } from '@intafaced/venue-contracts';
import { routingWeightFromCapture, type CaptureRoutingRecord } from './fabric/capture-routing.js';
import { measuredLatencyMs, routingWeightFromGrade } from './fabric/latency.js';

/**
 * §28 SMART ORDER ROUTER COST MODEL (D26-P1-X3).
 *
 * Law §28:770: the cost model includes fees, expected impact, latency grade,
 * and transfer cost between venues. The ranking rule itself is not reopened —
 * `router.ts` still ranks on all-in effective price with the single bounded
 * 5 bps internal tie-break (D-S-06 / house-desk ADR). This module supplies the
 * missing terms and the honesty gate when any term is absent.
 *
 * Honesty rules (refuse rather than invent):
 *
 *   · **Fee / impact / transfer** — each is an explicit bps input. `null` means
 *     unknown. Under the complete model an unknown term refuses the venue
 *     (routing weight 0). We do not default impact or transfer to zero: a silent
 *     zero is a claim that the cost is free.
 *   · **Latency grade** — consumed via `routingWeightFromGrade` (D26-P1-X2).
 *     Unscored (`grade: null` / `!isGraded`) **or** no live `p95Ms` → weight
 *     **zero**. Missing measurement is `null` from `liveLatencyScoreMs`, never
 *     a sentinel number and never an estimate. Letter→bps scaling is NOT
 *     invented here (D-S-14 owner magnitudes); a graded venue with a measured
 *     p95 is eligible (weight 1) and that p95 remains the equal-price
 *     tie-break in the router. Inventing a second latency-shaped thumb on the
 *     price scale is forbidden by the house-desk ADR.
 *   · **Capture fact** (optional, D26-P1-X2 deepen · coords #1739) — when
 *     supplied, a capture `hole` → weight **zero**. Absence in the lake must
 *     not be routed as if an empty book were observed. Omit the field when
 *     capture was not consulted (backward compatible).
 *
 * Leverage: Connect fabric `routingWeightFromGrade` / `isGraded`; capture
 * score-feed `routingWeightFromCapture`; existing fee-inclusive
 * `effectivePrice` arithmetic in the router.
 */

/** One venue's §28:770 cost terms. Every field may be null = unknown. */
export interface SorCostTerms {
  /** Taker fee in basis points. */
  readonly feeBps: number | null;
  /** Expected market impact for the contemplated fill size, in bps. */
  readonly expectedImpactBps: number | null;
  /**
   * Transfer / settlement cost of using this venue (inventory move, bridge,
   * withdrawal, etc.), in bps of notional. Not a mid — a disclosed cost input.
   */
  readonly transferCostBps: number | null;
  /**
   * Connect latency grade. `null` or ungraded → routing weight 0 (D-S-18).
   */
  readonly latencyGrade: VenueLatencyGrade | null;
  /**
   * Optional capture fact (#1739 `CaptureRecord` shape). When set, a hole
   * refuses the venue (weight 0). Omit when capture was not consulted.
   */
  readonly capture?: CaptureRoutingRecord | null;
}

export type SorStaticCostTerms = Omit<SorCostTerms, 'latencyGrade'>;

/**
 * Bind §27's measured adapter grade to §28's routing input.
 *
 * Callers supply only costs they actually know; latency cannot be supplied or
 * estimated through this door. It is read from the concrete adapter traffic.
 * An adapter without the grading contract returns `null`, which
 * `scoreSorCost` converts to routing weight zero.
 */
export function sorCostTermsFromAdapter(adapter: MarketDataAdapter, costs: SorStaticCostTerms, now: Date = new Date()): SorCostTerms {
  return {
    ...costs,
    latencyGrade: adapter.latencyGrade?.(now) ?? null,
  };
}

/**
 * Cost-model door for the live latency score.
 *
 * `null` means there is no measurement. Never `0`, never a sentinel, never an
 * estimated round-trip. `scoreSorCost` turns that absence into routing weight 0.
 */
export function liveLatencyScoreMs(grade: VenueLatencyGrade | null): number | null {
  if (grade === null) return null;
  return measuredLatencyMs(grade);
}

export type CostModelRefuseReason =
  'missing_fee' | 'missing_impact' | 'missing_transfer' | 'unscored_latency' | 'capture_hole' | 'negative_term';

export interface CostModelAccepted {
  readonly ok: true;
  readonly routingWeight: 1;
  readonly feeBps: number;
  readonly expectedImpactBps: number;
  readonly transferCostBps: number;
  /** Additive all-in cost in bps: fee + impact + transfer. */
  readonly totalCostBps: number;
}

export interface CostModelRefused {
  readonly ok: false;
  readonly routingWeight: 0;
  readonly reason: CostModelRefuseReason;
  readonly detail: string;
}

export type CostModelScore = CostModelAccepted | CostModelRefused;

function isMissingBps(value: number | null): value is null {
  return value === null || Number.isNaN(value);
}

/**
 * Score one venue under the complete §28 cost model.
 *
 * Returns weight 0 (and a refuse reason) when any required term is missing or
 * the latency grade is unscored. Never fabricates a default for a missing term.
 */
export function scoreSorCost(terms: SorCostTerms): CostModelScore {
  // Capture consulted and hole → zero weight before any fee invent temptation.
  if (terms.capture != null && routingWeightFromCapture(terms.capture) === 0) {
    const hole = terms.capture;
    const detail =
      hole.kind === 'hole'
        ? (hole.detail ?? `capture hole (${hole.reason}) — D-S-18 forbids routing on absent books`)
        : 'capture absence — D-S-18 forbids routing on absent books';
    return {
      ok: false,
      routingWeight: 0,
      reason: 'capture_hole',
      detail,
    };
  }

  if (
    terms.latencyGrade === null ||
    !isGraded(terms.latencyGrade) ||
    routingWeightFromGrade(terms.latencyGrade) === 0 ||
    liveLatencyScoreMs(terms.latencyGrade) === null
  ) {
    return {
      ok: false,
      routingWeight: 0,
      reason: 'unscored_latency',
      detail: 'latency grade absent or unscored — D-S-18 forbids routing weight',
    };
  }

  if (isMissingBps(terms.feeBps)) {
    return { ok: false, routingWeight: 0, reason: 'missing_fee', detail: 'feeBps unknown — refuse rather than assume 0' };
  }
  if (isMissingBps(terms.expectedImpactBps)) {
    return {
      ok: false,
      routingWeight: 0,
      reason: 'missing_impact',
      detail: 'expectedImpactBps unknown — refuse rather than assume 0',
    };
  }
  if (isMissingBps(terms.transferCostBps)) {
    return {
      ok: false,
      routingWeight: 0,
      reason: 'missing_transfer',
      detail: 'transferCostBps unknown — refuse rather than assume 0',
    };
  }

  if (terms.feeBps < 0 || terms.expectedImpactBps < 0 || terms.transferCostBps < 0) {
    return { ok: false, routingWeight: 0, reason: 'negative_term', detail: 'cost terms must be non-negative bps' };
  }

  return {
    ok: true,
    routingWeight: 1,
    feeBps: terms.feeBps,
    expectedImpactBps: terms.expectedImpactBps,
    transferCostBps: terms.transferCostBps,
    totalCostBps: terms.feeBps + terms.expectedImpactBps + terms.transferCostBps,
  };
}

/**
 * All-in effective price: quote price adjusted by fee + impact + transfer in
 * one additive bps step (standard SOR all-in cost). Same side convention as
 * `effectivePrice` in the router — buys add cost, sells subtract.
 */
export function allInEffectivePrice(price: Amount, totalCostBps: number, side: 'buy' | 'sell'): Amount {
  const cost = mulBps(price, totalCostBps, 'ceil');
  return side === 'buy' ? add(price, cost) : sub(price, cost);
}

/** Map refuse reason → router rejection tag. */
export function costRefuseToRouteReason(reason: CostModelRefuseReason): 'incomplete_cost' | 'zero_weight' {
  return reason === 'unscored_latency' || reason === 'capture_hole' ? 'zero_weight' : 'incomplete_cost';
}
