import { describe, expect, it } from 'vitest';
import { TournamentError } from './ladder.js';
import {
  PRIZE_REFUSE_CODE,
  assertNoPrizeAttachment,
  decidePrizeIntent,
  isPrizeRefuseClosed,
  prizeRefuseStatusLine,
  refuseFundPrizePool,
  refuseInventPrizeBalance,
  refusePrizeClawback,
  refusePrizeEscrow,
  refusePrizePayout,
} from './prize-refuse.js';

describe('tournament Stage-3 IFC prizes refuse-closed', () => {
  it('refuses fund / payout / escrow / clawback / invent', () => {
    for (const d of [
      refuseFundPrizePool(),
      refusePrizePayout(),
      refusePrizeEscrow(),
      refusePrizeClawback(),
      refuseInventPrizeBalance(),
      decidePrizeIntent('fund_pool'),
    ]) {
      expect(d.status).toBe('refuse');
      expect(d.code).toBe(PRIZE_REFUSE_CODE);
      expect(d.academyHoldsPrizeBalance).toBe(false);
      expect(d.ledgerRecipeReady).toBe(false);
      expect(isPrizeRefuseClosed(d)).toBe(true);
      expect(d.message).toMatch(/refuse-closed/);
    }
  });

  it('assertNoPrizeAttachment allows rank-only freeze payloads', () => {
    expect(() => assertNoPrizeAttachment({ seasonId: 's1', standings: [], frozenAt: new Date() })).not.toThrow();
    expect(() => assertNoPrizeAttachment(null)).not.toThrow();
  });

  it('assertNoPrizeAttachment throws on invent prize fields', () => {
    expect(() => assertNoPrizeAttachment({ prize: '10.00' })).toThrow(TournamentError);
    expect(() => assertNoPrizeAttachment({ prizePool: { amount: '1' } })).toThrow(TournamentError);
    expect(() => assertNoPrizeAttachment({ ifcPrize: 1 })).toThrow(TournamentError);
    expect(() => assertNoPrizeAttachment({ payout: true })).toThrow(TournamentError);
    expect(() => assertNoPrizeAttachment({ escrowAmount: '0' })).toThrow(TournamentError);
    expect(() => assertNoPrizeAttachment({ poolBalance: '0' })).toThrow(TournamentError);
  });

  it('status line is honest — no ledger', () => {
    expect(prizeRefuseStatusLine()).toBe(`prizes=refuse_closed code=${PRIZE_REFUSE_CODE} ledger=0`);
  });
});
