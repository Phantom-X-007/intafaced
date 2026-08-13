import { describe, expect, it } from 'vitest';
import { TournamentError } from './ladder.js';
import {
  PRIZE_POOL_CLASS_M_RESIDUAL,
  PRIZE_POOL_UNSET_CODE,
  PRIZE_POOL_UNSET_RESIDUAL,
  PRIZE_REFUSE_CODE,
  PrizePoolRefuseError,
  assertMayStartPrizeSeason,
  assertNoPrizeAttachment,
  decidePrizeIntent,
  decidePrizePoolStart,
  isPrizePoolUnset,
  isPrizePoolUnsetRefuse,
  isPrizeRefuseClosed,
  prizePoolStartRefuseExportHeader,
  prizePoolStartRefuseExportLine,
  prizePoolUnsetResidualIsHonest,
  prizeRefuseStatusLine,
  refuseFundPrizePool,
  refuseInventPrizeBalance,
  refusePrizeClawback,
  refusePrizeEscrow,
  refusePrizePayout,
  refuseUnsetPrizePoolStart,
  tryRefusePrizePoolStart,
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

  it('status line is honest — no ledger, no invent IFC, unset code greppable', () => {
    expect(prizeRefuseStatusLine()).toBe(
      `prizes=refuse_closed code=${PRIZE_REFUSE_CODE} unset=${PRIZE_POOL_UNSET_CODE} ledger=0 inventIfc=0`,
    );
  });
});

describe('D26-P1-C3 prize pools refuse if unset — no invent IFC', () => {
  it('detects blank / missing pool as unset', () => {
    expect(isPrizePoolUnset(null)).toBe(true);
    expect(isPrizePoolUnset(undefined)).toBe(true);
    expect(isPrizePoolUnset('')).toBe(true);
    expect(isPrizePoolUnset('   ')).toBe(true);
    expect(isPrizePoolUnset({})).toBe(true);
    expect(isPrizePoolUnset({ amount: null })).toBe(true);
    expect(isPrizePoolUnset({ amount: '' })).toBe(true);
    expect(isPrizePoolUnset({ prizePool: '  ' })).toBe(true);
    expect(isPrizePoolUnset(0)).toBe(true);
    expect(isPrizePoolUnset({ amount: '100.00' })).toBe(false);
    expect(isPrizePoolUnset('250.50')).toBe(false);
  });

  it('blank prize pool cannot start — typed academy.prize_pool_unset', () => {
    const d = decidePrizePoolStart(null);
    expect(d.status).toBe('refuse');
    expect(d.code).toBe(PRIZE_POOL_UNSET_CODE);
    expect(d.reason).toBe('unset');
    expect(d.inventedIfc).toBe(false);
    expect(d.ledgerRecipeReady).toBe(false);
    expect(isPrizePoolUnsetRefuse(d)).toBe(true);
    expect(d.message).toMatch(/unset/);
    expect(JSON.stringify(d)).not.toMatch(/"amount"/);
  });

  it('present amount still refuses invent IFC (Class M) — never pays', () => {
    const d = decidePrizePoolStart({ amount: '1000.00' });
    expect(d.status).toBe('refuse');
    expect(d.code).toBe(PRIZE_REFUSE_CODE);
    expect(d.reason).toBe('class_m');
    expect(d.inventedIfc).toBe(false);
    expect(isPrizePoolUnsetRefuse(d)).toBe(false);
  });

  it('assertMayStartPrizeSeason throws PrizePoolRefuseError without invent decimals', () => {
    expect(() => assertMayStartPrizeSeason(undefined)).toThrow(PrizePoolRefuseError);
    try {
      assertMayStartPrizeSeason('');
    } catch (err) {
      expect(err).toBeInstanceOf(PrizePoolRefuseError);
      const e = err as PrizePoolRefuseError;
      expect(e.code).toBe(PRIZE_POOL_UNSET_CODE);
      expect(e.reason).toBe('unset');
      expect(e.residual).toBe(PRIZE_POOL_UNSET_RESIDUAL);
      expect(prizePoolUnsetResidualIsHonest(e.residual)).toBe(true);
      expect(JSON.stringify(e)).not.toMatch(/\d+\.\d+/);
    }
    try {
      assertMayStartPrizeSeason({ amount: '50.00' });
    } catch (err) {
      const e = err as PrizePoolRefuseError;
      expect(e.code).toBe(PRIZE_REFUSE_CODE);
      expect(e.reason).toBe('class_m');
      expect(e.residual).toBe(PRIZE_POOL_CLASS_M_RESIDUAL);
    }
  });

  it('refuseUnsetPrizePoolStart is typed unset', () => {
    expect(() => refuseUnsetPrizePoolStart()).toThrow(PrizePoolRefuseError);
  });

  it('tryRefuse + export line carry reason,code only', () => {
    const unset = tryRefusePrizePoolStart(null);
    expect(prizePoolStartRefuseExportHeader()).toBe('reason,code');
    expect(prizePoolStartRefuseExportLine(unset)).toBe(`unset,${PRIZE_POOL_UNSET_CODE}`);
    const set = tryRefusePrizePoolStart('10');
    expect(prizePoolStartRefuseExportLine(set)).toBe(`class_m,${PRIZE_REFUSE_CODE}`);
  });
});
