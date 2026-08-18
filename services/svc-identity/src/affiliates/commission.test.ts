import { describe, expect, it } from 'vitest';
import { MemoryReferralTree } from './referral-tree.js';
import {
  accrueCommission,
  assertAffiliateSourceModule,
  countCommissionRowsByHop,
  decimalMul,
  listCommissionBeneficiaryIds,
  maxCommissionHop,
  summarizeCommissionRows,
  commissionSummaryBoardCard,
  commissionSummaryStatusLine,
  commissionSummaryStatusLineIsEmpty,
  parseCommissionSummaryStatusLine,
  commissionSummaryStatusLineMatches,
  commissionSummaryExportHeader,
  commissionSummaryExportLine,
  commissionSummaryExportText,
  commissionRowCountInRange,
  commissionSummaryIsZero,
  CommissionError,
  type TierRate,
} from './commission.js';

/** Test-only fixture — not a production default (DIRECTION §8). */
const FIXTURE_TIERS: readonly TierRate[] = [
  { hop: 0, rate: '0.10' },
  { hop: 1, rate: '0.05' },
  { hop: 2, rate: '0.02' },
];

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
      tiers: FIXTURE_TIERS,
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
      tiers: FIXTURE_TIERS,
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
      tiers: FIXTURE_TIERS,
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
      tiers: FIXTURE_TIERS,
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

  it('stamps sourceModule from the fee event (producer fee pool)', () => {
    const tree = new MemoryReferralTree();
    tree.attribute({ userId: 'u2', referrerId: 'u1' });
    const parent = new Map(tree.listEdges().map((e) => [e.userId, e.referrerId]));
    const rows = accrueCommission({
      fee: {
        feeEventId: 'f-trade',
        userId: 'u2',
        feeAmount: '100',
        asset: 'USDT',
        sourceModule: 'trade',
        at: new Date(),
      },
      parent,
      tiers: FIXTURE_TIERS,
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.sourceModule === 'trade')).toBe(true);
  });

  it('refuses invalid sourceModule rather than inventing a fee pool', () => {
    expect(() => assertAffiliateSourceModule('')).toThrowError(CommissionError);
    expect(() => assertAffiliateSourceModule('Trade')).toThrowError(CommissionError);
    expect(assertAffiliateSourceModule('trade')).toBe('trade');
  });
});

describe('L3 wave53 commission summary status/export', () => {
  it('empty and accrued boards use decimal strings', () => {
    const empty = summarizeCommissionRows([]);
    expect(commissionSummaryStatusLineIsEmpty(empty)).toBe(true);
    expect(commissionSummaryIsZero(empty)).toBe(true);
    expect(commissionSummaryStatusLineMatches(empty)).toBe(true);
    expect(parseCommissionSummaryStatusLine('nope')).toBeNull();
    expect(commissionSummaryExportText(empty).startsWith(commissionSummaryExportHeader())).toBe(true);

    const tree = new MemoryReferralTree();
    tree.attribute({ userId: 'u2', referrerId: 'u1' });
    const parent = new Map(tree.listEdges().map((e) => [e.userId, e.referrerId]));
    const rows = accrueCommission({
      fee: { feeEventId: 'f1', userId: 'u2', feeAmount: '100', asset: 'USDT', at: new Date() },
      parent,
      tiers: FIXTURE_TIERS,
    });
    const s = summarizeCommissionRows(rows);
    expect(commissionSummaryBoardCard(s).total).toBe('10');
    expect(commissionSummaryStatusLine(s)).toContain('total=10');
    expect(commissionSummaryStatusLineMatches(s)).toBe(true);
    expect(commissionRowCountInRange(s, 1, 5)).toBe(true);
    expect(commissionRowCountInRange(s, 5, 1)).toBe(false);
    expect(commissionSummaryExportLine(s)).toContain('USDT');
  });
});
