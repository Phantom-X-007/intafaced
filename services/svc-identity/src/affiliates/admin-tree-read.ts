/**
 * AFFILIATE / IB ADMIN TREE READ — Stage spine (TRK-ops.affiliates).
 *
 * Operator-visible tree structure + node status + member listing.
 * NO commission rates invent, NO fee accrual here, NO ledger payout
 * (Class M residual — DIRECTION §8 fee-share numbers are owner-only).
 *
 * Consumer: svc-identity router `affiliates.treeStatus` / `affiliates.node`
 * / `affiliates.members` / `affiliates.payout` (refuse-closed).
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

/** One attributed member row for admin roster (structure + freeze only). */
export type AffiliateTreeMember = {
  readonly userId: string;
  readonly referrerId: string;
  readonly depth: number;
  readonly frozen: boolean;
  readonly attributedAt: string | null;
};

/** Roster board — counts only, never invent edges or money. */
export type AffiliateMemberListBoard = {
  readonly total: number;
  readonly frozenInList: number;
  readonly maxDepthInList: number;
  readonly rootId: string | null;
};

/**
 * True when `userId` is `rootId` or a descendant under `rootId`.
 * Blank root → false.
 */
export function isUnderAffiliateRoot(
  parent: ReadonlyMap<string, string>,
  userId: string,
  rootId: string,
  maxDepth: number = DEFAULT_MAX_REFERRAL_DEPTH,
): boolean {
  const root = rootId.trim();
  const id = userId.trim();
  if (!root || !id) return false;
  if (id === root) return true;
  const chain = ancestors(parent, id, maxDepth);
  return chain.includes(root);
}

/**
 * Stage-2 admin member listing (attributed edges only).
 * - No rootId → every attributed edge (userId keys), sorted by depth then userId.
 * - With rootId → descendants under that root (root itself omitted unless they
 *   have an inbound edge — referrer-only roots are filters, not invent rows).
 * Empty parent → []. Never invents members or money fields.
 */
export function listAffiliateTreeMembers(input: {
  readonly parent: ReadonlyMap<string, string>;
  readonly attributedAt?: ReadonlyMap<string, Date> | null;
  readonly frozenIds?: ReadonlySet<string>;
  readonly rootId?: string | null;
  readonly maxDepth?: number;
}): readonly AffiliateTreeMember[] {
  const maxDepth = input.maxDepth ?? DEFAULT_MAX_REFERRAL_DEPTH;
  const rootId = input.rootId?.trim() || null;

  const out: AffiliateTreeMember[] = [];
  for (const [userId, referrerId] of input.parent.entries()) {
    if (rootId) {
      // Descendants only: ancestor chain must include root (not the root row).
      const chain = ancestors(input.parent, userId, maxDepth);
      if (!chain.includes(rootId)) continue;
    }
    const at = input.attributedAt?.get(userId);
    out.push({
      userId,
      referrerId,
      depth: chainDepth(input.parent, userId),
      frozen: input.frozenIds?.has(userId) ?? false,
      attributedAt: at ? at.toISOString() : null,
    });
  }

  return out.sort((a, b) => a.depth - b.depth || a.userId.localeCompare(b.userId));
}

/** Board card from a member list (empty → zeros). */
export function buildAffiliateMemberListBoard(
  members: readonly AffiliateTreeMember[],
  rootId: string | null = null,
): AffiliateMemberListBoard {
  let maxDepthInList = 0;
  let frozenInList = 0;
  for (const m of members) {
    if (m.depth > maxDepthInList) maxDepthInList = m.depth;
    if (m.frozen) frozenInList += 1;
  }
  return {
    total: members.length,
    frozenInList,
    maxDepthInList,
    rootId: rootId?.trim() || null,
  };
}

/** Status line for member roster (structure only). */
export function affiliateMemberListStatusLine(board: AffiliateMemberListBoard): string {
  const root = board.rootId ?? '-';
  return `total=${board.total} frozen=${board.frozenInList} maxDepth=${board.maxDepthInList} root=${root}`;
}

/**
 * Freeze/unfreeze honesty — after operator freeze mutate, confirm set membership
 * without inventing accrual/payout amounts.
 */
export function affiliateFreezeHonestyLine(input: {
  readonly beneficiaryId: string;
  readonly frozenIds: ReadonlySet<string>;
  readonly action: 'freeze' | 'unfreeze';
}): string {
  const id = input.beneficiaryId.trim();
  const isFrozen = id.length > 0 && input.frozenIds.has(id);
  const expected = input.action === 'freeze';
  const ok = id.length > 0 && isFrozen === expected ? '1' : '0';
  return `action=${input.action} id=${id || '-'} frozen=${isFrozen ? '1' : '0'} ok=${ok}`;
}

/** True when honesty line reports ok=1 for the named action. */
export function affiliateFreezeHonestyOk(line: string): boolean {
  return /(?:^|\s)ok=1(?:\s|$)/.test(line.trim());
}
