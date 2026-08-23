/**
 * connect.latency-grading product policy — measurement not estimate (§27 / D-S-18).
 *
 * Consolidates the public honesty posture from `latency.ts`. Does not invent
 * threshold magnitudes, letter→bps scaling, or venue wiring order.
 */

/** REST door — routing still consumes this. WS handshake is a second member. */
export const LATENCY_GRADING_MEASUREMENT = 'rest-round-trip' as const;
export const LATENCY_GRADING_WS_MEASUREMENT = 'ws-round-trip' as const;

export type LatencyPolicySummary = ReturnType<typeof describeLatencyGradingPolicy>;

/** Public honesty board for connect.latency-grading fabric grading. */
export function describeLatencyGradingPolicy() {
  return {
    measurement: LATENCY_GRADING_MEASUREMENT,
    wsMeasurement: LATENCY_GRADING_WS_MEASUREMENT,
    measurementNotEstimate: true as const,
    unscoredRoutingWeightZero: true as const,
    ungradedIsNotLowScore: true as const,
    usesRoundTripP95: true as const,
    usesRejectRate: true as const,
    usesStaleness: true as const,
    thresholdsOwnerUnruled: true as const,
    inventsLetterToBpsScaling: false as const,
    inventsDefaultGrade: false as const,
    inventsVenueList: false as const,
    wsRoundTripMeasured: true as const,
    /** Depth-delta travel after the socket is open — not handshake. */
    streamLagNotMeasured: true as const,
  };
}
