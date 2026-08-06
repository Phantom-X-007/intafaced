import { describe, expect, it } from 'vitest';
import { MemoryReferralTree } from './referral-tree.js';
import { accrueWithFreezes } from './freeze.js';

describe('affiliates freeze at accrual (no payout)', () => {
  it('skips frozen beneficiary rows', () => {
    const tree = new MemoryReferralTree();
    tree.attribute({ userId: 'u2', referrerId: 'u1' });
    tree.attribute({ userId: 'u3', referrerId: 'u2' });
    const parent = new Map(tree.listEdges().map((e) => [e.userId, e.referrerId]));
    const all = accrueWithFreezes({
      fee: {
        feeEventId: 'f1',
        userId: 'u3',
        feeAmount: '100',
        asset: 'USDT',
        at: new Date('2026-08-05T00:00:00.000Z'),
      },
      parent,
      frozenBeneficiaryIds: new Set(),
    });
    expect(all.length).toBeGreaterThan(0);
    const frozen = accrueWithFreezes({
      fee: {
        feeEventId: 'f1',
        userId: 'u3',
        feeAmount: '100',
        asset: 'USDT',
        at: new Date('2026-08-05T00:00:00.000Z'),
      },
      parent,
      frozenBeneficiaryIds: new Set(['u2']),
    });
    expect(frozen.every((r) => r.beneficiaryId !== 'u2')).toBe(true);
    expect(frozen.length).toBeLessThan(all.length);
  });
});
