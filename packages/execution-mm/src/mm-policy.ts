/**
 * execution.market-making product policy — external-only half honesty (§28 / D26-P1-X5).
 *
 * Consolidates the public posture from `market-making.ts`. Kill-first, owner
 * magnitudes only — internal half blocked until explicit owner ruling.
 */
export type MarketMakingPolicySummary = ReturnType<typeof describeMarketMakingPolicy>;

/** Public honesty board for execution.market-making external-only engine half. */
export function describeMarketMakingPolicy() {
  return {
    externalOnlyV1: true as const,
    internalHalfBlocked: true as const,
    killSwitchAppliesFirst: true as const,
    ownerSpreadSkewBandsOnly: true as const,
    ownerMmpThresholdsOnly: true as const,
    unsetMmpDisablesMassQuote: true as const,
    ridesSorCostModelOnly: true as const,
    missingMidRefused: true as const,
    missingBookRefused: true as const,
    incompleteCostRefused: true as const,
    inventsMids: false as const,
    inventsSpreadMagnitudes: false as const,
    inventsMmpThresholds: false as const,
    inventsDepth: false as const,
    noSecondMoneyBook: true as const,
  };
}
