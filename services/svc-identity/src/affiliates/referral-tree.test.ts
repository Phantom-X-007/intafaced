import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_REFERRAL_DEPTH, MemoryReferralTree, ReferralError, ancestors, chainDepth, wouldCreateCycle } from './referral-tree.js';

const U = (n: number) => `${n}1111111-1111-4111-8111-11111111111${n}`;

describe('wouldCreateCycle / chainDepth', () => {
  it('detects a cycle if attach would close a loop', () => {
    const p = new Map([
      [U(2), U(1)],
      [U(3), U(2)],
    ]);
    // 1→3 would cycle 1-2-3-1
    expect(wouldCreateCycle(p, U(1), U(3))).toBe(true);
    expect(wouldCreateCycle(p, U(4), U(3))).toBe(false);
  });

  it('measures chain depth', () => {
    const p = new Map([
      [U(2), U(1)],
      [U(3), U(2)],
    ]);
    expect(chainDepth(p, U(1))).toBe(0);
    expect(chainDepth(p, U(3))).toBe(2);
  });
});

describe('MemoryReferralTree Slice A', () => {
  it('attributes once and lists ancestors nearest-first', () => {
    const tree = new MemoryReferralTree();
    tree.attribute({ userId: U(2), referrerId: U(1) });
    tree.attribute({ userId: U(3), referrerId: U(2) });
    expect(tree.parentOf(U(3))).toBe(U(2));
    expect(ancestors(new Map(tree.listEdges().map((e) => [e.userId, e.referrerId])), U(3))).toEqual([U(2), U(1)]);
    expect(tree.ancestorsOf(U(3))).toEqual([U(2), U(1)]);
  });

  it('refuses self-referral, re-attribute, and cycles', () => {
    const tree = new MemoryReferralTree();
    expect(() => tree.attribute({ userId: U(1), referrerId: U(1) })).toThrow(ReferralError);
    tree.attribute({ userId: U(2), referrerId: U(1) });
    expect(() => tree.attribute({ userId: U(2), referrerId: U(3) })).toThrow(ReferralError);
    tree.attribute({ userId: U(3), referrerId: U(2) });
    expect(() => tree.attribute({ userId: U(1), referrerId: U(3) })).toThrow(ReferralError);
  });

  it('enforces max depth', () => {
    const tree = new MemoryReferralTree(2);
    tree.attribute({ userId: U(2), referrerId: U(1) });
    tree.attribute({ userId: U(3), referrerId: U(2) });
    // referrer U(3) has depth 2; child would be depth 3 > 2
    expect(() => tree.attribute({ userId: U(4), referrerId: U(3) })).toThrow(ReferralError);
    expect(DEFAULT_MAX_REFERRAL_DEPTH).toBe(5);
  });

  it('refuses unknown referrer when known set provided', () => {
    const tree = new MemoryReferralTree();
    const known = new Set([U(1)]);
    expect(() => tree.attribute({ userId: U(2), referrerId: U(9), knownUserIds: known })).toThrow(ReferralError);
    expect(tree.attribute({ userId: U(2), referrerId: U(1), knownUserIds: known }).referrerId).toBe(U(1));
  });

  it('L3 directDownline is hop-0 only — no invent multi-tier', () => {
    const tree = new MemoryReferralTree();
    tree.attribute({ userId: U(2), referrerId: U(1) });
    tree.attribute({ userId: U(3), referrerId: U(1) });
    tree.attribute({ userId: U(4), referrerId: U(2) });
    expect(tree.directDownlineCount(U(1))).toBe(2);
    expect(tree.directDownline(U(1))).toEqual([U(2), U(3)]);
    expect(tree.directDownlineCount(U(2))).toBe(1);
    expect(tree.directDownlineCount(U(9))).toBe(0);
  });

  it('L3 directDownlineCounts multi-referrer without invent', () => {
    const tree = new MemoryReferralTree();
    tree.attribute({ userId: U(2), referrerId: U(1) });
    tree.attribute({ userId: U(3), referrerId: U(1) });
    tree.attribute({ userId: U(4), referrerId: U(2) });
    expect(tree.directDownlineCounts([U(1), U(2), U(9)])).toEqual({
      [U(1)]: 2,
      [U(2)]: 1,
      [U(9)]: 0,
    });
    expect(tree.maxDirectDownline([U(1), U(2), U(9)])).toBe(2);
    expect(tree.maxDirectDownline([])).toBe(0);
  });

  it('L3 wave10 edgeCount + hasReferrer', () => {
    const tree = new MemoryReferralTree();
    expect(tree.edgeCount()).toBe(0);
    expect(tree.hasReferrer(U(1))).toBe(false);
    tree.attribute({ userId: U(2), referrerId: U(1) });
    tree.attribute({ userId: U(3), referrerId: U(1) });
    expect(tree.edgeCount()).toBe(2);
    expect(tree.hasReferrer(U(2))).toBe(true);
    expect(tree.hasReferrer(U(1))).toBe(false);
    expect(tree.hasReferrer('  ')).toBe(false);
  });

  it('L3 listReferrerIds unique sorted', () => {
    const tree = new MemoryReferralTree();
    expect(tree.listReferrerIds()).toEqual([]);
    tree.attribute({ userId: U(2), referrerId: U(1) });
    tree.attribute({ userId: U(3), referrerId: U(1) });
    expect(tree.listReferrerIds()).toEqual([U(1)]);
  });

  it('L3 wave13 listAttributedUserIds + referrerOf', () => {
    const tree = new MemoryReferralTree();
    expect(tree.listAttributedUserIds()).toEqual([]);
    expect(tree.referrerOf(U(1))).toBeNull();
    tree.attribute({ userId: U(2), referrerId: U(1) });
    tree.attribute({ userId: U(3), referrerId: U(1) });
    expect(tree.listAttributedUserIds()).toEqual([U(2), U(3)]);
    expect(tree.referrerOf(U(2))).toBe(U(1));
    expect(tree.referrerOf(U(1))).toBeNull();
    expect(tree.referrerOf('  ')).toBeNull();
  });

  it('L3 wave16 isRoot + depthOf', () => {
    const tree = new MemoryReferralTree();
    expect(tree.isRoot(U(1))).toBe(true);
    expect(tree.depthOf(U(1))).toBe(0);
    tree.attribute({ userId: U(2), referrerId: U(1) });
    tree.attribute({ userId: U(3), referrerId: U(2) });
    expect(tree.isRoot(U(2))).toBe(false);
    expect(tree.depthOf(U(2))).toBe(1);
    expect(tree.depthOf(U(3))).toBe(2);
    expect(tree.isRoot('  ')).toBe(false);
  });

  it('L3 wave21 maxChainDepth + referrerCount', () => {
    const tree = new MemoryReferralTree();
    expect(tree.maxChainDepth()).toBe(0);
    expect(tree.referrerCount()).toBe(0);
    tree.attribute({ userId: U(2), referrerId: U(1) });
    tree.attribute({ userId: U(3), referrerId: U(2) });
    expect(tree.maxChainDepth()).toBe(2);
    expect(tree.referrerCount()).toBe(2);
  });
});
