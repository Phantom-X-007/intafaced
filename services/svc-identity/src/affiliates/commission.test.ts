import { describe, expect, it } from 'vitest';
import { MemoryReferralTree } from './referral-tree.js';
import {
  accrueCommission,
  countCommissionRowsByHop,
  decimalMul,
  DEFAULT_ACCRUAL_TIERS,
  listCommissionBeneficiaryIds, maxCommissionHop,
  summarizeCommissionRows,
} from './commission.js';

describe('affiliates Slice B — commission accrual (no payout)', () => {
  it('decimalMul truncates to 18dp without float', () => {
    expect(decimalMul('100.00', '0.10')).toBe('10');
    // truncate (not round): 1.5 * 0.333… is 0.4999… at 18dp
    expect(decimalMul('1.5', '0.333333333333333333')).toBe('0.499999999999999999');
  });

  it('zero fee → zero commission rows', () => {
    const tree = new MemoryReferralTree();
    tree.attribute({ userId: 'u2', referrerId: 'u1' });
    const parent = new Map(tree.listEdges().map((e) => [e.userId, e.referrerId]));
    const rows = accrueCommission({
      fee: {
        feeEventId: 'f0',
        userId: 'u2',
        feeAmount: '0',
        asset: 'USDT',
        at: new Date('2026-08-05T00:00:00.000Z'),
      },
      parent,
      tiers: DEFAULT_ACCRUAL_TIERS,
    });
    expect(rows).toEqual([]);
  });

  it('fee event → multi-tier commission decimal strings', () => {
    const tree = new MemoryReferralTree();
    tree.attribute({ userId: 'u2', referrerId: 'u1' });
    tree.attribute({ userId: 'u3', referrerId: 'u2' });
    const parent = new Map(tree.listEdges().map((e) => [e.userId, e.referrerId]));
    const at = new Date('2026-08-05T12:00:00.000Z');
    const rows = accrueCommission({
      fee: { feeEventId: 'f1', userId: 'u3', feeAmount: '100', asset: 'USDT', at },
      parent,
      tiers: DEFAULT_ACCRUAL_TIERS,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      beneficiaryId: 'u2',
      hop: 0,
      rate: '0.10',
      commissionAmount: '10',
      feeAmount: '100',
    });
    expect(rows[1]).toMatchObject({
      beneficiaryId: 'u1',
      hop: 1,
      rate: '0.05',
      commissionAmount: '5',
    });
    // no hop-2 because chain depth from u3 only reaches u1 at hop 1
  });

  it('orphan payer (no referrer) → no rows', () => {
    const rows = accrueCommission({
      fee: {
        feeEventId: 'f2',
        userId: 'solo',
        feeAmount: '50',
        asset: 'USDT',
        at: new Date(),
      },
      parent: new Map(),
      tiers: DEFAULT_ACCRUAL_TIERS,
    });
    expect(rows).toEqual([]);
  });

  it('L3 summarizeCommissionRows dry-run totals as decimal strings', () => {
    expect(summarizeCommissionRows([])).toEqual({
      rowCount: 0,
      byBeneficiary: {},
      totalCommission: '0',
      asset: null,
    });
    const tree = new MemoryReferralTree();
    tree.attribute({ userId: 'u2', referrerId: 'u1' });
    const parent = new Map(tree.listEdges().map((e) => [e.userId, e.referrerId]));
    const rows = accrueCommission({
      fee: { feeEventId: 'f1', userId: 'u2', feeAmount: '100', asset: 'USDT', at: new Date() },
      parent,
      tiers: DEFAULT_ACCRUAL_TIERS,
    });
    const s = summarizeCommissionRows(rows);
    expect(s.rowCount).toBe(1);
    expect(s.totalCommission).toBe('10');
    expect(s.byBeneficiary['u1']).toBe('10');
    expect(s.asset).toBe('USDT');
    expect(countCommissionRowsByHop(rows)).toEqual({ 0: 1 });
    expect(countCommissionRowsByHop([])).toEqual({});
    expect(listCommissionBeneficiaryIds(rows)).toEqual(['u1']);
    expect(listCommissionBeneficiaryIds([])).toEqual([]);
    expect(maxCommissionHop(rows)).toBe(0);
    expect(maxCommissionHop([])).toBeNull();
  });
});
