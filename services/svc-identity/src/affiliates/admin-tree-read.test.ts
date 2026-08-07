import { describe, expect, it } from 'vitest';
import { MemoryReferralTree } from './referral-tree.js';
import {
  AFFILIATE_PAYOUT_RESIDUAL,
  AffiliatePayoutRefuseError,
  affiliatePayoutResidualNamesDirectionLaw,
  affiliateTreeStatusLine,
  buildAffiliateNodeStatus,
  buildAffiliateTreeBoard,
  directDownlineOf,
  refuseAffiliatePayout,
} from './admin-tree-read.js';

const U = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function parentFrom(tree: MemoryReferralTree): Map<string, string> {
  return new Map(tree.listEdges().map((e) => [e.userId, e.referrerId]));
}

describe('affiliates Stage — admin tree read (non-pay)', () => {
  it('empty tree board is honest zeros', () => {
    const board = buildAffiliateTreeBoard({ parent: new Map() });
    expect(board).toEqual({
      edges: 0,
      referrers: 0,
      maxDepth: 0,
      frozenCount: 0,
      maxDepthCap: 5,
    });
    expect(affiliateTreeStatusLine(board)).toBe('edges=0 referrers=0 maxDepth=0 frozen=0 cap=5');
  });

  it('reports multi-tier structure without inventing money', () => {
    const tree = new MemoryReferralTree();
    tree.attribute({ userId: U(2), referrerId: U(1) });
    tree.attribute({ userId: U(3), referrerId: U(2) });
    tree.attribute({ userId: U(4), referrerId: U(1) });
    const parent = parentFrom(tree);
    const board = buildAffiliateTreeBoard({
      parent,
      frozenIds: new Set([U(2)]),
    });
    expect(board.edges).toBe(3);
    expect(board.referrers).toBe(2);
    expect(board.maxDepth).toBe(2);
    expect(board.frozenCount).toBe(1);
    expect(affiliateTreeStatusLine(board)).toContain('frozen=1');
  });

  it('node status: root vs attributed vs downline', () => {
    const tree = new MemoryReferralTree();
    const at = new Date('2026-08-07T12:00:00.000Z');
    tree.attribute({ userId: U(2), referrerId: U(1), now: at });
    tree.attribute({ userId: U(3), referrerId: U(2) });
    const parent = parentFrom(tree);
    const attributedAt = new Map(tree.listEdges().map((e) => [e.userId, e.attributedAt]));

    const root = buildAffiliateNodeStatus({
      userId: U(1),
      parent,
      attributedAt,
      frozenIds: new Set(),
    });
    expect(root.referrerId).toBeNull();
    expect(root.depth).toBe(0);
    expect(root.directDownline).toEqual([U(2)]);
    expect(root.frozen).toBe(false);
    expect(root.attributedAt).toBeNull();

    const mid = buildAffiliateNodeStatus({
      userId: U(2),
      parent,
      attributedAt,
      frozenIds: new Set([U(2)]),
    });
    expect(mid.referrerId).toBe(U(1));
    expect(mid.depth).toBe(1);
    expect(mid.ancestors).toEqual([U(1)]);
    expect(mid.directDownline).toEqual([U(3)]);
    expect(mid.directDownlineCount).toBe(1);
    expect(mid.frozen).toBe(true);
    expect(mid.attributedAt).toBe(at.toISOString());
  });

  it('directDownlineOf sorts and ignores blank', () => {
    const tree = new MemoryReferralTree();
    tree.attribute({ userId: U(3), referrerId: U(1) });
    tree.attribute({ userId: U(2), referrerId: U(1) });
    expect(directDownlineOf(parentFrom(tree), U(1))).toEqual([U(2), U(3)]);
    expect(directDownlineOf(parentFrom(tree), '  ')).toEqual([]);
  });

  it('refuseAffiliatePayout is Class M residual — never invents rates', () => {
    expect(affiliatePayoutResidualNamesDirectionLaw()).toBe(true);
    expect(AFFILIATE_PAYOUT_RESIDUAL).toContain('DIRECTION §8');
    try {
      refuseAffiliatePayout();
      expect.unreachable('must throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AffiliatePayoutRefuseError);
      const e = err as AffiliatePayoutRefuseError;
      expect(e.code).toBe('affiliate.payout.rates_unset');
      expect(e.residual).toBe(AFFILIATE_PAYOUT_RESIDUAL);
    }
  });
});
