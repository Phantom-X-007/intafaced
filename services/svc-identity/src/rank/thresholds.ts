import type { RankPerks } from '@intafaced/contracts';

/**
 * THE RANK LADDER (§4.1).
 *
 * `perks` is the machine-readable table other services query. svc-trade reads
 * `feeDiscountBps` and applies it without knowing what a rank means; svc-p2p
 * reads `p2pLimitMultiplier`. That indirection is what lets the ladder be
 * re-tuned without touching a second service.
 *
 * This file seeds `rank_thresholds`. Once seeded the DATABASE is authoritative,
 * so an operator can re-tune from apps/admin without a deploy.
 */

export interface RankTier {
  readonly rank: number;
  readonly xpRequired: bigint;
  readonly title: string;
  readonly perks: RankPerks;
}

function perks(overrides: Partial<RankPerks>): RankPerks {
  return {
    feeDiscountBps: 0,
    p2pLimitMultiplier: 1,
    copyFollowerCap: 0,
    lobbyHostRights: false,
    cardTier: 'none',
    otcAccess: false,
    launchpadTier: 0,
    ...overrides,
  };
}

/**
 * Curve: each tier costs roughly 2.2× the last. Slow enough that rank means
 * something, shallow enough at the bottom that a new user sees movement in
 * their first session — which is what makes the ladder legible at all.
 */
export const RANK_TIERS: readonly RankTier[] = [
  { rank: 0, xpRequired: 0n, title: 'Initiate', perks: perks({}) },
  { rank: 1, xpRequired: 500n, title: 'Operator', perks: perks({ feeDiscountBps: 25, p2pLimitMultiplier: 1.25 }) },
  { rank: 2, xpRequired: 1_500n, title: 'Runner', perks: perks({ feeDiscountBps: 50, p2pLimitMultiplier: 1.5, copyFollowerCap: 10 }) },
  {
    rank: 3,
    xpRequired: 4_000n,
    title: 'Dealer',
    perks: perks({ feeDiscountBps: 100, p2pLimitMultiplier: 2, copyFollowerCap: 50, cardTier: 'standard' }),
  },
  {
    rank: 4,
    xpRequired: 10_000n,
    title: 'Broker',
    perks: perks({ feeDiscountBps: 150, p2pLimitMultiplier: 3, copyFollowerCap: 250, cardTier: 'standard', lobbyHostRights: true }),
  },
  {
    rank: 5,
    xpRequired: 25_000n,
    title: 'Desk',
    perks: perks({
      feeDiscountBps: 200,
      p2pLimitMultiplier: 4,
      copyFollowerCap: 1_000,
      cardTier: 'metal',
      lobbyHostRights: true,
      launchpadTier: 1,
    }),
  },
  {
    rank: 6,
    xpRequired: 60_000n,
    title: 'Principal',
    perks: perks({
      feeDiscountBps: 275,
      p2pLimitMultiplier: 6,
      copyFollowerCap: 5_000,
      cardTier: 'metal',
      lobbyHostRights: true,
      otcAccess: true,
      launchpadTier: 2,
    }),
  },
  {
    rank: 7,
    xpRequired: 150_000n,
    title: 'Sovereign',
    perks: perks({
      feeDiscountBps: 350,
      p2pLimitMultiplier: 10,
      copyFollowerCap: 25_000,
      cardTier: 'obsidian',
      lobbyHostRights: true,
      otcAccess: true,
      launchpadTier: 3,
    }),
  },
];

export const MAX_RANK = RANK_TIERS[RANK_TIERS.length - 1]!.rank;

/**
 * Rank for a given XP total.
 *
 * Walks downward so the highest satisfied tier wins. XP never decreases in
 * normal operation, but a correction (a reversed trade, a revoked
 * certification) can lower it — and rank must follow honestly rather than
 * ratchet. A rank you cannot lose is not a rank.
 */
export function rankForXp(xp: bigint, tiers: readonly RankTier[] = RANK_TIERS): number {
  for (let i = tiers.length - 1; i >= 0; i--) {
    const tier = tiers[i]!;
    if (xp >= tier.xpRequired) return tier.rank;
  }
  return 0;
}

export function tierFor(rank: number, tiers: readonly RankTier[] = RANK_TIERS): RankTier {
  return tiers.find((t) => t.rank === rank) ?? tiers[0]!;
}

export function perksFor(rank: number, tiers: readonly RankTier[] = RANK_TIERS): RankPerks {
  return tierFor(rank, tiers).perks;
}

/** XP still needed for the next tier — null at max rank. */
export function xpToNextRank(xp: bigint, tiers: readonly RankTier[] = RANK_TIERS): bigint | null {
  const next = tiers.find((t) => t.xpRequired > xp);
  return next ? next.xpRequired - xp : null;
}

/**
 * L3 — pure progress snapshot for UI (no money, no invent rank).
 * XP fields are decimal strings of non-negative integers.
 */
export type RankProgress = {
  readonly rank: number;
  readonly title: string;
  readonly xp: string;
  readonly xpToNext: string | null;
  readonly nextRank: number | null;
  readonly nextTitle: string | null;
  readonly atMax: boolean;
};

export function rankProgress(xp: bigint, tiers: readonly RankTier[] = RANK_TIERS): RankProgress {
  const safeXp = xp < 0n ? 0n : xp;
  const rank = rankForXp(safeXp, tiers);
  const tier = tierFor(rank, tiers);
  const toNext = xpToNextRank(safeXp, tiers);
  const next = tiers.find((t) => t.xpRequired > safeXp) ?? null;
  return {
    rank,
    title: tier.title,
    xp: safeXp.toString(),
    xpToNext: toNext === null ? null : toNext.toString(),
    nextRank: next?.rank ?? null,
    nextTitle: next?.title ?? null,
    atMax: toNext === null,
  };
}

/**
 * XP awards per action, per module.
 *
 * Kept here rather than in each module so the economy is visible in one place —
 * otherwise "how much is a P2P trade worth relative to a certification" becomes
 * unanswerable without reading nine services.
 */
export const XP_AWARDS: Readonly<Record<string, number>> = {
  'identity.registered': 50,
  'identity.kyc.approved': 200,
  'identity.totp.enrolled': 100,
  'identity.webauthn.enrolled': 100,

  'trade.order.filled': 5,
  'trade.first.trade': 100,
  'trade.volume.milestone': 250,

  'p2p.trade.completed': 25,
  'p2p.dispute.resolved.favour': 10,

  'academy.lesson.completed': 15,
  'academy.certification.earned': 500,
  'academy.workbook.completed': 150,

  'pay.merchant.onboarded': 300,
  'pay.first.payment': 100,

  'token.staked': 75,
  'blueprint.completed': 250,
};

export function xpFor(action: string): number {
  return XP_AWARDS[action] ?? 0;
}
