/**
 * academy.tournaments product policy — calendar + prize refuse honesty (D26-P1-C3).
 *
 * Stage-1 ladders only. No IFC prize pools, no ledger recipes on this path.
 */
import { PRIZE_POOL_UNSET_CODE, PRIZE_REFUSE_CODE } from './prize-refuse.js';

export type TournamentPolicySummary = ReturnType<typeof describeTournamentPolicy>;

/** Public honesty board for academy.tournaments — non-money calendar + prize refuse. */
export function describeTournamentPolicy() {
  return {
    prizeRefuseCode: PRIZE_REFUSE_CODE,
    prizePoolUnsetCode: PRIZE_POOL_UNSET_CODE,
    academyHoldsPrizeBalance: false as const,
    ledgerRecipeReady: false as const,
    calendarNeverImpliesPayout: true as const,
    scoreWindowRequiresLiveSeason: true as const,
    inventsPrizeBalances: false as const,
    inventsIfcCredits: false as const,
  };
}
