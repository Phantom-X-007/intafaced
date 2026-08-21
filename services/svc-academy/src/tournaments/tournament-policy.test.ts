import { describe, expect, it } from 'vitest';
import { PRIZE_POOL_CLASS_M_RESIDUAL, PRIZE_POOL_UNSET_CODE, PRIZE_POOL_UNSET_RESIDUAL, PRIZE_REFUSE_CODE } from './prize-refuse.js';
import { TOURNAMENT_POLICY_RESIDUAL, describeTournamentPolicy } from './tournament-policy.js';

describe('describeTournamentPolicy', () => {
  it('states prize refuse honesty without inventing IFC balances', () => {
    const p = describeTournamentPolicy();
    expect(p.prizeRefuseCode).toBe(PRIZE_REFUSE_CODE);
    expect(p.prizePoolUnsetCode).toBe(PRIZE_POOL_UNSET_CODE);
    expect(p.prizePoolUnsetResidual).toBe(PRIZE_POOL_UNSET_RESIDUAL);
    expect(p.prizePoolClassMResidual).toBe(PRIZE_POOL_CLASS_M_RESIDUAL);
    expect(p.residual).toBe(TOURNAMENT_POLICY_RESIDUAL);
    expect(p.academyHoldsPrizeBalance).toBe(false);
    expect(p.ledgerRecipeReady).toBe(false);
    expect(p.inventsPrizeBalances).toBe(false);
    expect(p.inventsIfcCredits).toBe(false);
    expect(p.movesMoney).toBe(false);
    expect(p.calendarNeverImpliesPayout).toBe(true);
    expect(p.scoreWindowRequiresLiveSeason).toBe(true);
    expect(p.frozenToLiveRefused).toBe(true);
  });
});
