import { describe, expect, it } from 'vitest';
import { parseAmount as amt, formatAmount } from '@intafaced/ledger-client';
import { fundingAmount, notionalQuote, planFundingSettlement, summarizeFundingPlan } from './funding-settlement.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const pos = (positionId: string, side: 'long' | 'short', userId = A) => ({
  positionId,
  userId,
  side,
  size: amt('1'),
  entryPrice: amt('50000'),
  marginAsset: 'USDT',
});

describe('funding-settlement planner', () => {
  /**
   * The ledger key is the whole safety story for a replayed tick, and until now
   * no test asserted anything about it — five tests over two double-charge
   * fixes, none of them looking at `idempotencyKey`.
   */
  it('every leg in a plan carries a distinct ledger key', () => {
    const legs = planFundingSettlement({
      periodId: 'm1:t0',
      marketId: 'm1',
      rate: '0.0001',
      positions: [pos('L1', 'long'), pos('L2', 'long'), pos('S1', 'short', B), pos('S2', 'short', B)],
    });
    expect(legs).toHaveLength(4);
    expect(new Set(legs.map((l) => l.recipe.idempotencyKey)).size).toBe(4);
  });

  it('the key does not depend on row order — a reordered book plans identically', () => {
    // `opened_at` is not unique, so two positions opened in one tick had no
    // stable order between queries. Under the old loop-counter key that alone
    // re-posted the entire plan on a replay.
    const input = { periodId: 'm1:t0', marketId: 'm1', rate: '0.0001' };
    const forward = planFundingSettlement({ ...input, positions: [pos('L1', 'long'), pos('S1', 'short', B), pos('S2', 'short', B)] });
    const reversed = planFundingSettlement({ ...input, positions: [pos('S2', 'short', B), pos('S1', 'short', B), pos('L1', 'long')] });

    expect(new Set(forward.map((l) => l.recipe.idempotencyKey))).toEqual(new Set(reversed.map((l) => l.recipe.idempotencyKey)));
  });

  it('refuses a plan whose legs would dedupe against each other', () => {
    // A duplicate position id cannot reach here today — the loader joins on two
    // primary keys — but if it ever does, the ledger would swallow the colliding
    // leg while the margin applier decrements for both, and the row and the
    // money would disagree with no error anywhere.
    expect(() =>
      planFundingSettlement({
        periodId: 'm1:t0',
        marketId: 'm1',
        rate: '0.0001',
        positions: [pos('L1', 'long'), pos('S1', 'short', B), pos('S1', 'short', B)],
      }),
    ).toThrow(/distinct ledger keys/);
  });

  it('notional and funding amount scale correctly', () => {
    // 1 BTC * 50k = 50k quote notional; 1bp of period = 5 quote
    expect(notionalQuote(amt('1'), amt('50000'))).toBe(amt('50000'));
    expect(fundingAmount(amt('50000'), amt('0.0001'))).toBe(amt('5'));
  });

  /**
   * KNOWN RESIDUAL (funding period membership) — prove, do not fix.
   *
   * The loader returns positions open *now*, not as of the period. A position
   * opened between a failed tick and its replay is a new pair with a new key,
   * so the ledger posts an extra leg. applyFundingNets is idempotent on
   * (position, period) and records only the first net for the original payer —
   * ledger-vs-margin divergence. Product law needed for membership; this test
   * freezes the arithmetic of the residual so a silent "fix" cannot land.
   */
  it('documents membership residual: a new position mid-period adds a new ledger key for the same period', () => {
    const periodId = 'm1:period-membership';
    const first = planFundingSettlement({
      periodId,
      marketId: 'm1',
      rate: '0.0001',
      positions: [pos('L1', 'long'), pos('S1', 'short', B)],
    });
    const afterOpen = planFundingSettlement({
      periodId,
      marketId: 'm1',
      rate: '0.0001',
      positions: [pos('L1', 'long'), pos('L_new', 'long'), pos('S1', 'short', B)],
    });
    expect(first).toHaveLength(1);
    expect(afterOpen.length).toBeGreaterThan(first.length);
    const firstKeys = new Set(first.map((l) => l.recipe.idempotencyKey));
    const newKeys = afterOpen.map((l) => l.recipe.idempotencyKey).filter((k) => !firstKeys.has(k));
    expect(newKeys.length).toBeGreaterThan(0);
    // Original pair still present under the same key (replay-safe for that leg).
    expect(firstKeys.has(afterOpen.find((l) => l.payerPositionId === 'L1' && l.payeePositionId === 'S1')!.recipe.idempotencyKey)).toBe(
      true,
    );
  });

  it('zero rate → no legs', () => {
    const legs = planFundingSettlement({
      periodId: 'm1:t0',
      marketId: 'm1',
      rate: '0',
      positions: [
        {
          positionId: 'p1',
          userId: A,
          side: 'long',
          size: amt('1'),
          entryPrice: amt('50000'),
          marginAsset: 'USDT',
        },
        {
          positionId: 'p2',
          userId: B,
          side: 'short',
          size: amt('1'),
          entryPrice: amt('50000'),
          marginAsset: 'USDT',
        },
      ],
    });
    expect(legs).toEqual([]);
  });

  it('positive rate: long pays short', () => {
    const legs = planFundingSettlement({
      periodId: 'm1:2026-07-31T00:00:00Z',
      marketId: 'm1',
      rate: '0.0001',
      positions: [
        {
          positionId: 'plong',
          userId: A,
          side: 'long',
          size: amt('1'),
          entryPrice: amt('50000'),
          marginAsset: 'USDT',
        },
        {
          positionId: 'pshort',
          userId: B,
          side: 'short',
          size: amt('1'),
          entryPrice: amt('50000'),
          marginAsset: 'USDT',
        },
      ],
    });
    expect(legs).toHaveLength(1);
    expect(legs[0]!.payerPositionId).toBe('plong');
    expect(legs[0]!.payeePositionId).toBe('pshort');
    expect(formatAmount(legs[0]!.amount)).toBe('5');
    expect(legs[0]!.recipe.reason).toBe('futures.funding.paid');
    expect(summarizeFundingPlan(legs)).toContain('1 leg');
  });

  it('negative rate: short pays long', () => {
    const legs = planFundingSettlement({
      periodId: 'm1:t1',
      marketId: 'm1',
      rate: '-0.0001',
      positions: [
        {
          positionId: 'plong',
          userId: A,
          side: 'long',
          size: amt('1'),
          entryPrice: amt('50000'),
          marginAsset: 'USDT',
        },
        {
          positionId: 'pshort',
          userId: B,
          side: 'short',
          size: amt('1'),
          entryPrice: amt('50000'),
          marginAsset: 'USDT',
        },
      ],
    });
    expect(legs[0]!.payerPositionId).toBe('pshort');
    expect(legs[0]!.payeePositionId).toBe('plong');
  });

  it('one-sided book → no legs', () => {
    const legs = planFundingSettlement({
      periodId: 'm1:t2',
      marketId: 'm1',
      rate: '0.0001',
      positions: [
        {
          positionId: 'plong',
          userId: A,
          side: 'long',
          size: amt('1'),
          entryPrice: amt('50000'),
          marginAsset: 'USDT',
        },
      ],
    });
    expect(legs).toEqual([]);
  });
});
