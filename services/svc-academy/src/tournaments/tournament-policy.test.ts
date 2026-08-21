import { describe, expect, it } from 'vitest';
import { PRIZE_POOL_UNSET_CODE, PRIZE_REFUSE_CODE } from './prize-refuse.js';
import { describeTournamentPolicy } from './tournament-policy.js';

describe('describeTournamentPolicy', () => {
  it('states prize refuse honesty without inventing IFC balances', () => {
    const p = describeTournamentPolicy();
    expect(p.prizeRefuseCode).toBe(PRIZE_REFUSE_CODE);
    expect(p.prizePoolUnsetCode).toBe(PRIZE_POOL_UNSET_CODE);
    expect(p.academyHoldsPrizeBalance).toBe(false);
    expect(p.inventsPrizeBalances).toBe(false);
    expect(p.calendarNeverImpliesPayout).toBe(true);
  });
});
