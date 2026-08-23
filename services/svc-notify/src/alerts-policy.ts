/**
 * v22.alerts product policy — price watch refuse honesty (MVP mountain).
 *
 * Portfolio and Phase-5 kinds refuse until sourced series / ledger view exist.
 */
import { ALERT_MARK_MAX_AGE_MS } from './alerts/accepted-mark.js';
import { ALERT_SWEEP_INTERVAL_MS } from './alerts/service.js';
import { ALERT_KIND_UNPUBLISHED, ALERT_PORTFOLIO_VIEW_UNPUBLISHED, SOURCED_ALERT_KINDS, UNPUBLISHED_ALERT_KINDS } from './alerts/types.js';

export type AlertsPolicySummary = ReturnType<typeof describeAlertsPolicy>;

/** Public honesty board for v22.alerts — evaluate refuse paths, not invented marks. */
export function describeAlertsPolicy() {
  return {
    publishedKind: 'price' as const,
    publishedKinds: [...SOURCED_ALERT_KINDS],
    priceWatchCoreOnly: false as const,
    sourcedSeriesOnly: true as const,
    unpublishedKinds: [...UNPUBLISHED_ALERT_KINDS],
    portfolioViewUnpublishedCode: ALERT_PORTFOLIO_VIEW_UNPUBLISHED,
    kindUnpublishedCode: ALERT_KIND_UNPUBLISHED,
    markMaxAgeMs: ALERT_MARK_MAX_AGE_MS,
    sweepIntervalMs: ALERT_SWEEP_INTERVAL_MS,
    darkMarkRefusesFire: true as const,
    inventsPrices: false as const,
    inventsPortfolioBalance: false as const,
    sweepEvaluatesDueAlerts: true as const,
    ridesNotifyFanout: true as const,
    oneShotFire: true as const,
    moneyNeverNumber: true as const,
  };
}
