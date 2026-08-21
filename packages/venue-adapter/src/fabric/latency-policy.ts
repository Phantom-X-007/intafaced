/**
 * connect.latency-grading product policy — measurement not estimate (§27 / D-S-18).
 *
 * Unscored adapters get zero routing weight — never a low default score.
 */
export type LatencyPolicySummary = ReturnType<typeof describeLatencyGradingPolicy>;

/** Public honesty board for connect.latency-grading fabric grading. */
export function describeLatencyGradingPolicy() {
  return {
    measurementNotEstimate: true as const,
    unscoredRoutingWeightZero: true as const,
    usesRoundTripP95: true as const,
    usesRejectRate: true as const,
    usesStaleness: true as const,
    inventsDefaultGrade: false as const,
    inventsVenueList: false as const,
  };
}
