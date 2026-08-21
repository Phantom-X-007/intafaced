/**
 * ws.depth / market-data product policy — incremental book honesty (§5.2).
 *
 * Consolidates the public posture from `depth.ts`. Absolute deltas, gap refuse,
 * stale refuse, no synthetic empty book from absent capture.
 */
export type DepthPolicySummary = ReturnType<typeof describeDepthPolicy>;

/** Apply-result reasons the incremental book refuses rather than drifting. */
export const DEPTH_GAP_REFUSE_REASON = 'gap' as const;
export const DEPTH_STALE_REFUSE_REASON = 'stale' as const;
export const DEPTH_ABSENT_REFUSE_REASON = 'absent' as const;

/** Public honesty board for @intafaced/market-data incremental depth. */
export function describeDepthPolicy() {
  return {
    absoluteDeltaLevels: true as const,
    zeroQuantityRemovesLevel: true as const,
    absentLevelMeansUnchanged: true as const,
    gapRefusesApply: true as const,
    gapRefuseReason: DEPTH_GAP_REFUSE_REASON,
    staleRefusesApply: true as const,
    staleRefuseReason: DEPTH_STALE_REFUSE_REASON,
    resnapshotOnGap: true as const,
    unconnectedVenueIsAbsent: true as const,
    holeNotSyntheticEmptyBook: true as const,
    absentRefuseReason: DEPTH_ABSENT_REFUSE_REASON,
    measuredEmptyBookWhenConnected: true as const,
    pricesAndQtyDecimalStrings: true as const,
    inventsQuietMarket: false as const,
    inventsPhantomLiquidity: false as const,
  };
}
