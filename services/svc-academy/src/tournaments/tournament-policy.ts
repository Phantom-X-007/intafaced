/**
 * academy.tournaments product policy — calendar + prize refuse honesty (D26-P1-C3).
 *
 * Stage-1 ladders only. No IFC prize pools, no ledger recipes on this path.
 */
import { PRIZE_POOL_CLASS_M_RESIDUAL, PRIZE_POOL_UNSET_CODE, PRIZE_POOL_UNSET_RESIDUAL, PRIZE_REFUSE_CODE } from './prize-refuse.js';

export const TOURNAMENT_POLICY_RESIDUAL =
  'TRK-academy.tournaments D26-P1-C3 — Stage-1 ladder; IFC prizes refuse-closed; calendar never implies payout';

export type TournamentPolicySummary = ReturnType<typeof describeTournamentPolicy>;

/** Public honesty board for academy.tournaments — non-money calendar + prize refuse. */
export function describeTournamentPolicy() {
  return {
    prizeRefuseCode: PRIZE_REFUSE_CODE,
    prizePoolUnsetCode: PRIZE_POOL_UNSET_CODE,
    prizePoolUnsetResidual: PRIZE_POOL_UNSET_RESIDUAL,
    prizePoolClassMResidual: PRIZE_POOL_CLASS_M_RESIDUAL,
    residual: TOURNAMENT_POLICY_RESIDUAL,
    academyHoldsPrizeBalance: false as const,
    ledgerRecipeReady: false as const,
    calendarNeverImpliesPayout: true as const,
    scoreWindowRequiresLiveSeason: true as const,
    frozenToLiveRefused: true as const,
    inventsPrizeBalances: false as const,
    inventsIfcCredits: false as const,
    movesMoney: false as const,
  };
}
