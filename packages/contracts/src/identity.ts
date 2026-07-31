import { z } from 'zod';

/**
 * IDENTITY CONTRACT — the reference example of the zod-first pattern (§3).
 *
 * The pattern, in order:
 *   1. Declare zod schemas for input and output. They are the contract.
 *   2. Derive TypeScript types from them — never hand-write a duplicate type.
 *   3. Declare the router shape with `satisfies`, so the implementing service
 *      is checked against this file rather than the other way around.
 *
 * Callers import types from here. They never import svc-identity.
 */

export const kycTierSchema = z.enum(['none', 'basic', 'full', 'institutional']);
export type KycTierValue = z.infer<typeof kycTierSchema>;

/**
 * The perk table other services query (§4.1). Machine-readable on purpose:
 * svc-trade reads `feeDiscountBps` and applies it without knowing what a rank
 * means, which is why rank can be re-tuned without touching a second service.
 */
export const rankPerksSchema = z.object({
  feeDiscountBps: z.number().int().min(0).max(10_000),
  p2pLimitMultiplier: z.number().min(1),
  copyFollowerCap: z.number().int().min(0),
  lobbyHostRights: z.boolean(),
  cardTier: z.enum(['none', 'standard', 'metal', 'obsidian']),
  otcAccess: z.boolean(),
  launchpadTier: z.number().int().min(0),
});
export type RankPerks = z.infer<typeof rankPerksSchema>;

export const rankStateSchema = z.object({
  userId: z.string().uuid(),
  rank: z.number().int().min(0),
  xp: z.string(),
  seasonXp: z.string(),
  nextRankAt: z.string().nullable(),
  updatedAt: z.string().datetime({ offset: true }),
});
export type RankState = z.infer<typeof rankStateSchema>;

export const getRankInput = z.object({ userId: z.string().uuid() });
export const getPerksInput = z.object({ userId: z.string().uuid() });

export const awardXpInput = z.object({
  userId: z.string().uuid(),
  sourceModule: z.string().min(1),
  action: z.string().min(1),
  xpDelta: z.number().int(),
  /** Dedupe key — the same achievement must never be paid twice. */
  idempotencyKey: z.string().min(8),
  meta: z.record(z.unknown()).optional(),
});

export const principalSummarySchema = z.object({
  userId: z.string().uuid(),
  handle: z.string(),
  tier: kycTierSchema,
  region: z.string().length(2).nullable(),
  rank: z.number().int(),
  modes: z.array(z.enum(['trader', 'merchant', 'creator', 'student'])),
  blueprintId: z.string().uuid().nullable(),
});
export type PrincipalSummary = z.infer<typeof principalSummarySchema>;

/**
 * The shape svc-identity must implement. Declaring it here means a breaking
 * change to identity's API is a compile error in this package — caught in the
 * contracts PR, before any consumer is touched (§15.2).
 */
export interface IdentityContract {
  rank: {
    get(input: z.infer<typeof getRankInput>): Promise<RankState>;
    perks(input: z.infer<typeof getPerksInput>): Promise<RankPerks>;
    awardXp(input: z.infer<typeof awardXpInput>): Promise<RankState>;
  };
  me(): Promise<PrincipalSummary>;
}

/** Default perks at rank 0 — what an unranked account gets everywhere. */
export const BASE_PERKS: RankPerks = {
  feeDiscountBps: 0,
  p2pLimitMultiplier: 1,
  copyFollowerCap: 0,
  lobbyHostRights: false,
  cardTier: 'none',
  otcAccess: false,
  launchpadTier: 0,
};

/**
 * S2S ownership snapshot for a sub-account (svc-trade placeOrder gate).
 *
 * Internal only — not the interactive list shape. Caller compares
 * `parentUserId` to the edge principal and refuses when `revoked`.
 */
export const subAccountOwnershipSchema = z.object({
  id: z.string().uuid(),
  parentUserId: z.string().uuid(),
  revoked: z.boolean(),
});
export type SubAccountOwnership = z.infer<typeof subAccountOwnershipSchema>;
