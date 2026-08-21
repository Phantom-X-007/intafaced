/**
 * execution.sor product policy — one ranking rule honesty (§28 / D26-P1-X3).
 *
 * Consolidates the public posture from `router.ts`. Bounded 5 bps internal
 * preference at ranking time only — worse internal still loses.
 */
import { ACCEPTED_INTERNAL_PREFERENCE_BPS, capInternalPreferenceBps } from './router.js';

export type SorRoutingPolicySummary = ReturnType<typeof describeSorRoutingPolicy>;

/** Public honesty board for venue-adapter SOR ranking. */
export function describeSorRoutingPolicy() {
  return {
    acceptedInternalPreferenceBps: ACCEPTED_INTERNAL_PREFERENCE_BPS,
    preferenceCappedAtAccepted: true as const,
    worseInternalStillLoses: true as const,
    rankingUsesEffectivePrice: true as const,
    incompleteCostRefused: true as const,
    zeroWeightUnscoredLatency: true as const,
    noSecondRankingRule: true as const,
    inventsVenuePreference: false as const,
    inventsDefaultSpread: false as const,
  };
}

/** Callers cannot raise the house thumb above the accepted ceiling. */
export function resolvesInternalPreferenceBps(requested?: number): number {
  return capInternalPreferenceBps(requested);
}
