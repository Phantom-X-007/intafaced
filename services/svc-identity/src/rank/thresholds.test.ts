import { describe, expect, it } from 'vitest';
import { RANK_TIERS, MAX_RANK, perksFor, rankForXp, tierFor, xpToNextRank, XP_AWARDS, xpFor } from './thresholds.js';

describe('the rank ladder', () => {
  it('starts at 0 XP so every user has a rank from the moment they exist', () => {
    expect(rankForXp(0n)).toBe(0);
    expect(RANK_TIERS[0]?.xpRequired).toBe(0n);
  });

  it('increases monotonically — a tier never costs less than the one below', () => {
    for (let i = 1; i < RANK_TIERS.length; i++) {
      expect(RANK_TIERS[i]!.xpRequired).toBeGreaterThan(RANK_TIERS[i - 1]!.xpRequired);
      expect(RANK_TIERS[i]!.rank).toBe(RANK_TIERS[i - 1]!.rank + 1);
    }
  });

  it('awards the highest tier the XP satisfies', () => {
    expect(rankForXp(499n)).toBe(0);
    expect(rankForXp(500n)).toBe(1);
    expect(rankForXp(1_499n)).toBe(1);
    expect(rankForXp(1_500n)).toBe(2);
    expect(rankForXp(150_000n)).toBe(MAX_RANK);
    expect(rankForXp(999_999_999n)).toBe(MAX_RANK);
  });

  it('never yields a negative rank', () => {
    expect(rankForXp(-100n)).toBe(0);
  });

  it('improves perks monotonically — ranking up never costs you a benefit', () => {
    for (let i = 1; i < RANK_TIERS.length; i++) {
      const lower = RANK_TIERS[i - 1]!.perks;
      const higher = RANK_TIERS[i]!.perks;

      expect(higher.feeDiscountBps).toBeGreaterThanOrEqual(lower.feeDiscountBps);
      expect(higher.p2pLimitMultiplier).toBeGreaterThanOrEqual(lower.p2pLimitMultiplier);
      expect(higher.copyFollowerCap).toBeGreaterThanOrEqual(lower.copyFollowerCap);
      expect(higher.launchpadTier).toBeGreaterThanOrEqual(lower.launchpadTier);
      if (lower.lobbyHostRights) expect(higher.lobbyHostRights).toBe(true);
      if (lower.otcAccess) expect(higher.otcAccess).toBe(true);
    }
  });

  it('keeps the fee discount inside a sane bound', () => {
    // A discount at or above 100% would mean the house pays the user to trade.
    for (const tier of RANK_TIERS) {
      expect(tier.perks.feeDiscountBps).toBeLessThan(10_000);
    }
  });

  it('reports XP remaining to the next tier, and null at the top', () => {
    expect(xpToNextRank(0n)).toBe(500n);
    expect(xpToNextRank(499n)).toBe(1n);
    expect(xpToNextRank(500n)).toBe(1_000n);
    expect(xpToNextRank(150_000n)).toBeNull();
  });

  it('falls back to rank 0 for an unknown rank rather than throwing', () => {
    expect(tierFor(999).rank).toBe(0);
    expect(perksFor(-1).feeDiscountBps).toBe(0);
  });
});

describe('XP awards', () => {
  it('prices a certification well above a single trade', () => {
    // The economy has to make the Academy worth doing.
    expect(XP_AWARDS['academy.certification.earned']!).toBeGreaterThan(XP_AWARDS['trade.order.filled']! * 50);
  });

  it('returns zero for an unknown action instead of guessing', () => {
    expect(xpFor('nonsense.action')).toBe(0);
  });

  it('has no negative awards in the table — corrections are explicit, not routine', () => {
    for (const [action, xp] of Object.entries(XP_AWARDS)) {
      expect(xp, action).toBeGreaterThan(0);
    }
  });
});
