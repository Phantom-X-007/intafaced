/**
 * Live pay-metrics door for merchant approval-rate watch.
 *
 * Production leave this unset: live pay metrics are Class X. An unset port is
 * the honest refuse (`no_live_metrics`) — never a scraped fake API, never a
 * 0.00 approval rate invented from silence.
 *
 * Caller-supplied points stay fixture/dark only. Live truth is this port.
 */

import type { ApprovalRatePoint } from './watch.js';

export type PayMetricsPort = {
  /**
   * Grounded live samples. Empty array or throw = unavailable.
   * Never invent rates inside the port.
   */
  sample(): Promise<readonly ApprovalRatePoint[]>;
};

export type LivePayMetrics =
  { readonly ok: true; readonly points: readonly ApprovalRatePoint[] } | { readonly ok: false; readonly reason: 'no_live_metrics' };

/**
 * Resolve live samples. Missing port, empty series, or sample failure all
 * collapse to the same named refuse — not an empty board and not 0.00.
 */
export async function readLivePayMetrics(port: PayMetricsPort | undefined): Promise<LivePayMetrics> {
  if (port === undefined) {
    return { ok: false, reason: 'no_live_metrics' };
  }
  try {
    const points = await port.sample();
    if (!Array.isArray(points) || points.length === 0) {
      return { ok: false, reason: 'no_live_metrics' };
    }
    return { ok: true, points };
  } catch {
    return { ok: false, reason: 'no_live_metrics' };
  }
}
