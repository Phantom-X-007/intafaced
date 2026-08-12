/**
 * Merchant agent Stage-1 — approval-rate watch on fixtures only.
 *
 * Spec: docs/ops/trk/agents.merchant.md Stage 1.
 * Done bar (D26-P1-A4): approval-rate watch honest when data missing.
 *
 * Rules:
 *   · Input is caller-supplied fixture series — never invents approval rates.
 *   · Missing/null rates refuse, not zero-filled into a green "100%".
 *   · Non-empty railAllowlist requires a usable metric for EVERY listed rail —
 *     silent partial `ok` over a configured set invents completeness.
 *   · Threshold breach → structured alert only; no rail change, no ledger.
 *   · pay.routing product law remains residual (Class M / owner) — Stage-1
 *     does not invent routing selection.
 */

export type ApprovalRatePoint = {
  /** Rail / method id (opaque string from caller; not resolved here). */
  readonly railId: string;
  /**
   * Approvals / attempts as a decimal fraction string in [0,1], e.g. "0.92".
   * null = metric unavailable for this window.
   */
  readonly approvalRate: string | null;
  /** Sample size (attempts). null = unknown. */
  readonly attempts: number | null;
  /** Observation time (ISO-8601). */
  readonly asOf: string;
  /** Max age of this point in ms for the watch call. */
  readonly maxAgeMs: number;
};

export type MerchantAlert = {
  readonly railId: string;
  readonly approvalRate: string;
  readonly attempts: number;
  readonly threshold: string;
  readonly kind: 'below_threshold';
};

export type WatchOk = {
  readonly status: 'ok';
  readonly watchedAt: string;
  readonly considered: number;
  readonly skippedStale: number;
  readonly skippedIncomplete: number;
  /**
   * Points with attempts below the sample floor (including attempts=0).
   * Not alerts — a 0% rate on zero attempts is noise, not a rail failure.
   */
  readonly skippedLowSample: number;
  readonly alerts: readonly MerchantAlert[];
};

export type WatchEmpty = {
  readonly status: 'empty';
  readonly userMessageKey: 'agents.merchant.empty';
};

export type WatchUnavailable = {
  readonly status: 'unavailable';
  readonly userMessageKey: 'agents.merchant.unavailable';
  readonly reason: 'stale' | 'no_metrics' | 'pay_plane_dark' | 'incomplete_coverage';
  /**
   * Allowlisted rails that had no usable metric. Present when reason is
   * `incomplete_coverage` — never invent a rate to fill these gaps.
   */
  readonly missingRailIds?: readonly string[];
};

export type WatchResult = WatchOk | WatchEmpty | WatchUnavailable;

/**
 * Stage-2: when the pay plane is dark (no metrics API / routing residual),
 * refuse rather than invent approval rates. Does not change rails.
 */
export type PayPlaneState = 'live' | 'dark';

function parseRate(s: string): number | null {
  if (!/^(0(\.\d+)?|1(\.0+)?)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

function isFresh(asOf: string, maxAgeMs: number, nowMs: number): boolean {
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= maxAgeMs && nowMs - t >= 0;
}

function toAllowlistSet(allowlist: ReadonlySet<string> | readonly string[] | undefined): ReadonlySet<string> | null {
  if (!allowlist) return null;
  const set = allowlist instanceof Set ? allowlist : new Set(allowlist);
  return set.size === 0 ? null : set;
}

/**
 * A point is usable when it can honestly participate in threshold arithmetic —
 * fresh, complete fields, valid fraction, and above the sample floor.
 */
export function isUsableApprovalPoint(point: ApprovalRatePoint, options: { nowMs: number; minAttempts: number }): boolean {
  if (!point.railId) return false;
  if (!isFresh(point.asOf, point.maxAgeMs, options.nowMs)) return false;
  if (point.approvalRate == null || point.attempts == null) return false;
  if (!Number.isInteger(point.attempts) || point.attempts < 0) return false;
  if (point.attempts < options.minAttempts) return false;
  return parseRate(point.approvalRate) != null;
}

/**
 * When a non-empty allowlist is configured, every listed rail must have at
 * least one usable metric. Missing configured rails are not silently dropped
 * into a partial green board.
 */
export function missingAllowlistRails(
  points: readonly ApprovalRatePoint[],
  allowlist: ReadonlySet<string> | readonly string[],
  options: { nowMs: number; minAttempts: number },
): readonly string[] {
  const set = allowlist instanceof Set ? allowlist : new Set(allowlist);
  const missing: string[] = [];
  for (const railId of set) {
    const hasUsable = points.some((p) => p.railId === railId && isUsableApprovalPoint(p, options));
    if (!hasUsable) missing.push(railId);
  }
  return missing.sort();
}

/**
 * Stage-2 L3: optional rail allowlist. Empty/missing → all points.
 * Out-of-scope rails skipped (not invent alerts for unknown rails).
 */
export function filterRailsByAllowlist(
  points: readonly ApprovalRatePoint[],
  allowlist: ReadonlySet<string> | readonly string[] | undefined,
): { readonly kept: readonly ApprovalRatePoint[]; readonly skippedNotAllowed: number } {
  if (!allowlist) return { kept: points, skippedNotAllowed: 0 };
  const set = allowlist instanceof Set ? allowlist : new Set(allowlist);
  if (set.size === 0) return { kept: points, skippedNotAllowed: 0 };
  const kept: ApprovalRatePoint[] = [];
  let skippedNotAllowed = 0;
  for (const p of points) {
    if (set.has(p.railId)) kept.push(p);
    else skippedNotAllowed += 1;
  }
  return { kept, skippedNotAllowed };
}

/**
 * Watch fixture approval-rate series. Emit alerts when rate < threshold.
 * Never invents rates; never changes rails.
 *
 * Sample floor (ops honesty): attempts must be ≥ 1. A rate on zero attempts is
 * not a metric — alerting on it invents a rail failure from empty data. Callers
 * may raise the floor with `minAttempts` (default 1).
 *
 * Allowlist coverage (D26-P1-A4): a non-empty `railAllowlist` is a configured
 * watch set. Any listed rail without a usable metric → `incomplete_coverage`
 * (not a silent partial `ok`).
 */
export function watchApprovalFixtures(
  points: readonly ApprovalRatePoint[],
  options: {
    now?: Date;
    /** decimal fraction string, default "0.85" */
    threshold?: string;
    /** Stage-2: dark pay plane → typed refuse, never invent rates */
    payPlane?: PayPlaneState;
    /** Stage-2 L3: only watch these rail ids when provided and non-empty. */
    railAllowlist?: ReadonlySet<string> | readonly string[];
    /**
     * Minimum attempts before a point can alert. Default 1 (zero-sample is
     * never an alert). Raised floors skip as `skippedLowSample`, not invent.
     */
    minAttempts?: number;
  } = {},
): WatchResult {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  if (options.payPlane === 'dark') {
    return { status: 'unavailable', userMessageKey: 'agents.merchant.unavailable', reason: 'pay_plane_dark' };
  }
  const thresholdStr = options.threshold ?? '0.85';
  const threshold = parseRate(thresholdStr);
  if (threshold == null) {
    return { status: 'unavailable', userMessageKey: 'agents.merchant.unavailable', reason: 'no_metrics' };
  }

  // Floor is at least 1 — zero attempts is never a usable sample.
  const minAttempts =
    options.minAttempts === undefined ? 1 : Number.isInteger(options.minAttempts) && options.minAttempts >= 1 ? options.minAttempts : 1;

  const allowlist = toAllowlistSet(options.railAllowlist);
  if (allowlist) {
    const missingRailIds = missingAllowlistRails(points, allowlist, { nowMs, minAttempts });
    if (missingRailIds.length > 0) {
      return {
        status: 'unavailable',
        userMessageKey: 'agents.merchant.unavailable',
        reason: 'incomplete_coverage',
        missingRailIds,
      };
    }
  }

  const { kept: scoped, skippedNotAllowed } = filterRailsByAllowlist(points, options.railAllowlist);

  if (scoped.length === 0) {
    return { status: 'empty', userMessageKey: 'agents.merchant.empty' };
  }

  let skippedStale = 0;
  let skippedIncomplete = skippedNotAllowed;
  let skippedLowSample = 0;
  const alerts: MerchantAlert[] = [];

  for (const p of scoped) {
    if (!p.railId) {
      skippedIncomplete += 1;
      continue;
    }
    if (!isFresh(p.asOf, p.maxAgeMs, nowMs)) {
      skippedStale += 1;
      continue;
    }
    if (p.approvalRate == null || p.attempts == null) {
      skippedIncomplete += 1;
      continue;
    }
    if (!Number.isInteger(p.attempts) || p.attempts < 0) {
      skippedIncomplete += 1;
      continue;
    }
    // Zero / below-floor samples are not incomplete fields — they are known-empty
    // metrics. Do not invent a below_threshold alert from them.
    if (p.attempts < minAttempts) {
      skippedLowSample += 1;
      continue;
    }
    const rate = parseRate(p.approvalRate);
    if (rate == null) {
      skippedIncomplete += 1;
      continue;
    }
    if (rate < threshold) {
      alerts.push({
        railId: p.railId,
        approvalRate: p.approvalRate,
        attempts: p.attempts,
        threshold: thresholdStr,
        kind: 'below_threshold',
      });
    }
  }

  const usable = scoped.length - skippedStale - (skippedIncomplete - skippedNotAllowed) - skippedLowSample;
  if (usable === 0 && alerts.length === 0) {
    if (skippedStale > 0 && skippedIncomplete === skippedNotAllowed && skippedLowSample === 0) {
      return { status: 'unavailable', userMessageKey: 'agents.merchant.unavailable', reason: 'stale' };
    }
    if (skippedIncomplete > skippedNotAllowed || skippedStale > 0 || skippedLowSample > 0) {
      return { status: 'unavailable', userMessageKey: 'agents.merchant.unavailable', reason: 'no_metrics' };
    }
    return { status: 'empty', userMessageKey: 'agents.merchant.empty' };
  }

  return {
    status: 'ok',
    watchedAt: now.toISOString(),
    considered: scoped.length + skippedNotAllowed,
    skippedStale,
    skippedIncomplete,
    skippedLowSample,
    alerts,
  };
}
