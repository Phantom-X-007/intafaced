/**
 * AFFILIATE / IB ADMIN TREE READ — Stage spine (TRK-ops.affiliates).
 *
 * Operator-visible tree structure + node status. NO commission rates invent,
 * NO fee accrual here, NO ledger payout (Class M residual — DIRECTION §8
 * fee-share numbers are owner-only).
 *
 * Consumer: svc-identity router `affiliates.treeStatus` / `affiliates.node`
 * / `affiliates.payout` (refuse-closed).
 */

import { ancestors, chainDepth, DEFAULT_MAX_REFERRAL_DEPTH, ReferralError } from './referral-tree.js';

/** Board card for the whole attribution graph (structure only). */
export type AffiliateTreeBoard = {
  readonly edges: number;
  readonly referrers: number;
  readonly maxDepth: number;
  readonly frozenCount: number;
  readonly maxDepthCap: number;
};

/** One user's place in the IB / affiliate tree (admin read). */
export type AffiliateNodeStatus = {
  readonly userId: string;
  readonly referrerId: string | null;
  readonly depth: number;
  readonly ancestors: readonly string[];
  readonly directDownline: readonly string[];
  readonly directDownlineCount: number;
  readonly frozen: boolean;
  readonly attributedAt: string | null;
};

export type AffiliatePayoutRefuseCode = 'affiliate.payout.rates_unset' | 'affiliate.payout.class_m';

/**
 * Named refuse for payout automation until owner-published rates + ledger recipe.
 * Never invent fee-share bps.
 */
export class AffiliatePayoutRefuseError extends Error {
  constructor(
    message: string,
    readonly code: AffiliatePayoutRefuseCode,
    readonly residual: string,
  ) {
    super(message);
    this.name = 'AffiliatePayoutRefuseError';
  }
}

/** Stable residual string operators / audits can grep. */
export const AFFILIATE_PAYOUT_RESIDUAL =
  'DIRECTION §8 fee-share / IB rates are owner-only; Class M ledger recipe not wired — refuse-closed';

/**
 * Build tree board from parent map + freeze set.
 * Empty tree → zeros (never invent edges).
 */
export function buildAffiliateTreeBoard(input: {
  readonly parent: ReadonlyMap<string, string>;
  readonly frozenIds?: ReadonlySet<string>;
  readonly maxDepthCap?: number;
}): AffiliateTreeBoard {
  const maxDepthCap = input.maxDepthCap ?? DEFAULT_MAX_REFERRAL_DEPTH;
  const referrers = new Set(input.parent.values());
  let maxDepth = 0;
  for (const userId of input.parent.keys()) {
    const d = chainDepth(input.parent, userId);
    if (d > maxDepth) maxDepth = d;
  }
  return {
    edges: input.parent.size,
    referrers: referrers.size,
    maxDepth,
    frozenCount: input.frozenIds?.size ?? 0,
    maxDepthCap,
  };
}

/** Status line for ops boards (structure only — no money fields). */
export function affiliateTreeStatusLine(board: AffiliateTreeBoard): string {
  return `edges=${board.edges} referrers=${board.referrers} maxDepth=${board.maxDepth} frozen=${board.frozenCount} cap=${board.maxDepthCap}`;
}

/** Direct children of referrer (hop-0), sorted. */
export function directDownlineOf(parent: ReadonlyMap<string, string>, referrerId: string): readonly string[] {
  const id = referrerId.trim();
  if (!id) return [];
  const out: string[] = [];
  for (const [userId, r] of parent.entries()) {
    if (r === id) out.push(userId);
  }
  return out.sort();
}

/**
 * Admin node card. Blank userId → ReferralError invalid.
 * Unknown / root user still returns a card (referrer null, depth 0).
 */
export function buildAffiliateNodeStatus(input: {
  readonly userId: string;
  readonly parent: ReadonlyMap<string, string>;
  readonly attributedAt?: ReadonlyMap<string, Date> | null;
  readonly frozenIds?: ReadonlySet<string>;
  readonly maxDepth?: number;
}): AffiliateNodeStatus {
  const userId = input.userId.trim();
  if (!userId) {
    throw new ReferralError('userId is required', 'referral.invalid');
  }
  const maxDepth = input.maxDepth ?? DEFAULT_MAX_REFERRAL_DEPTH;
  const referrerId = input.parent.get(userId) ?? null;
  const depth = chainDepth(input.parent, userId);
  const chain = ancestors(input.parent, userId, maxDepth);
  const directDownline = directDownlineOf(input.parent, userId);
  const at = input.attributedAt?.get(userId);
  return {
    userId,
    referrerId,
    depth,
    ancestors: chain,
    directDownline,
    directDownlineCount: directDownline.length,
    frozen: input.frozenIds?.has(userId) ?? false,
    attributedAt: at ? at.toISOString() : null,
  };
}

/**
 * Always refuse payout. Named residual — do not invent rates or post ledger.
 */
export function refuseAffiliatePayout(): never {
  throw new AffiliatePayoutRefuseError(
    'Affiliate payout automation is refuse-closed until owner-published fee-share rates and a ledger recipe exist',
    'affiliate.payout.rates_unset',
    AFFILIATE_PAYOUT_RESIDUAL,
  );
}

/** True when residual names DIRECTION §8 (honesty guard for tests / audits). */
export function affiliatePayoutResidualNamesDirectionLaw(residual: string = AFFILIATE_PAYOUT_RESIDUAL): boolean {
  return residual.includes('DIRECTION §8') && residual.includes('Class M');
}
