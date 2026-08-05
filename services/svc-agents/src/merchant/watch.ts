/**
 * Merchant agent Stage-1 — approval-rate watch on fixtures only.
 *
 * Spec: docs/ops/trk/agents.merchant.md Stage 1.
 *
 * Rules:
 *   · Input is caller-supplied fixture series — never invents approval rates.
 *   · Missing/null rates refuse, not zero-filled into a green "100%".
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
  readonly alerts: readonly MerchantAlert[];
};

export type WatchEmpty = {
  readonly status: 'empty';
  readonly userMessageKey: 'agents.merchant.empty';
};

export type WatchUnavailable = {
  readonly status: 'unavailable';
  readonly userMessageKey: 'agents.merchant.unavailable';
  readonly reason: 'stale' | 'no_metrics' | 'pay_plane_dark';
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

/**
 * Watch fixture approval-rate series. Emit alerts when rate < threshold.
 * Never invents rates; never changes rails.
 */
export function watchApprovalFixtures(
  points: readonly ApprovalRatePoint[],
  options: {
    now?: Date;
    /** decimal fraction string, default "0.85" */
    threshold?: string;
    /** Stage-2: dark pay plane → typed refuse, never invent rates */
    payPlane?: PayPlaneState;
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

  if (points.length === 0) {
    return { status: 'empty', userMessageKey: 'agents.merchant.empty' };
  }

  let skippedStale = 0;
  let skippedIncomplete = 0;
  const alerts: MerchantAlert[] = [];

  for (const p of points) {
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

  const usable = points.length - skippedStale - skippedIncomplete;
  if (usable === 0 && alerts.length === 0) {
    if (skippedStale > 0 && skippedIncomplete === 0) {
      return { status: 'unavailable', userMessageKey: 'agents.merchant.unavailable', reason: 'stale' };
    }
    if (skippedIncomplete > 0 || skippedStale > 0) {
      return { status: 'unavailable', userMessageKey: 'agents.merchant.unavailable', reason: 'no_metrics' };
    }
    return { status: 'empty', userMessageKey: 'agents.merchant.empty' };
  }

  return {
    status: 'ok',
    watchedAt: now.toISOString(),
    considered: points.length,
    skippedStale,
    skippedIncomplete,
    alerts,
  };
}
