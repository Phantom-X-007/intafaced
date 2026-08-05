/**
 * AFFILIATE / IB REFERRAL TREE — Slice A (TRK-ops.affiliates).
 *
 * Attribution edges only: who introduced whom. NO commission rates, NO fee
 * accrual, NO ledger payouts (Slice B/C Class M).
 *
 * Law:
 *   · self-referral refused
 *   · cycles refused (A→B→…→A)
 *   · depth capped (DEFAULT_MAX_REFERRAL_DEPTH) so multi-tier payout later has a bound
 *   · one parent per user (re-attribute refused once set — audit integrity)
 */

/** Product default multi-tier depth (referrer chain length). */
export const DEFAULT_MAX_REFERRAL_DEPTH = 5;

export type ReferralErrorCode =
  'referral.self' | 'referral.cycle' | 'referral.depth' | 'referral.already_set' | 'referral.unknown_referrer' | 'referral.invalid';

export class ReferralError extends Error {
  constructor(
    message: string,
    readonly code: ReferralErrorCode,
  ) {
    super(message);
    this.name = 'ReferralError';
  }
}

export interface ReferralEdge {
  userId: string;
  referrerId: string;
  /** When the edge was written (audit). */
  attributedAt: Date;
}

/**
 * Pure graph helpers — no I/O.
 *
 * `parent` map: userId → referrerId
 */
export function wouldCreateCycle(parent: ReadonlyMap<string, string>, userId: string, referrerId: string): boolean {
  // Walk from referrer upward; if we hit userId, attaching userId→referrer closes a cycle.
  let cur: string | undefined = referrerId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === userId) return true;
    if (seen.has(cur)) return true; // corrupt graph
    seen.add(cur);
    cur = parent.get(cur);
  }
  return false;
}

/** How many hops from user to root (0 if no parent). */
export function chainDepth(parent: ReadonlyMap<string, string>, userId: string): number {
  let depth = 0;
  let cur: string | undefined = parent.get(userId);
  const seen = new Set<string>();
  while (cur) {
    depth += 1;
    if (seen.has(cur)) throw new ReferralError('Referral graph contains a cycle', 'referral.cycle');
    seen.add(cur);
    cur = parent.get(cur);
  }
  return depth;
}

/** Ancestors of user, nearest parent first, up to maxDepth entries. */
export function ancestors(parent: ReadonlyMap<string, string>, userId: string, maxDepth: number = DEFAULT_MAX_REFERRAL_DEPTH): string[] {
  const out: string[] = [];
  let cur: string | undefined = parent.get(userId);
  const seen = new Set<string>();
  while (cur && out.length < maxDepth) {
    if (seen.has(cur)) throw new ReferralError('Referral graph contains a cycle', 'referral.cycle');
    seen.add(cur);
    out.push(cur);
    cur = parent.get(cur);
  }
  return out;
}

/**
 * In-memory referral store for Slice A tests + process-local use.
 * Durable SQL edge residual before multi-instance production.
 */
export class MemoryReferralTree {
  private readonly parent = new Map<string, string>();
  private readonly at = new Map<string, Date>();

  constructor(private readonly maxDepth: number = DEFAULT_MAX_REFERRAL_DEPTH) {}

  /**
   * Attribute `userId` to `referrerId` once.
   * Referrer must already exist as a known user id (caller supplies existence check)
   * OR already be in the tree / be allowed as root — we only require referrerId ≠ empty.
   */
  attribute(input: { userId: string; referrerId: string; now?: Date; knownUserIds?: ReadonlySet<string> }): ReferralEdge {
    const userId = input.userId.trim();
    const referrerId = input.referrerId.trim();
    if (!userId || !referrerId) {
      throw new ReferralError('userId and referrerId are required', 'referral.invalid');
    }
    if (userId === referrerId) {
      throw new ReferralError('Self-referral is refused', 'referral.self');
    }
    if (this.parent.has(userId)) {
      throw new ReferralError('Referral already set for this user', 'referral.already_set');
    }
    if (input.knownUserIds && !input.knownUserIds.has(referrerId)) {
      throw new ReferralError('Referrer is not a known user', 'referral.unknown_referrer');
    }
    if (wouldCreateCycle(this.parent, userId, referrerId)) {
      throw new ReferralError('Referral would create a cycle', 'referral.cycle');
    }
    // Depth of the new user = depth(referrer) + 1 must be ≤ maxDepth
    const referrerDepth = chainDepth(this.parent, referrerId);
    if (referrerDepth + 1 > this.maxDepth) {
      throw new ReferralError(`Referral depth exceeds max ${this.maxDepth} (referrer chain is already ${referrerDepth})`, 'referral.depth');
    }

    const attributedAt = input.now ?? new Date();
    this.parent.set(userId, referrerId);
    this.at.set(userId, attributedAt);
    return { userId, referrerId, attributedAt };
  }

  parentOf(userId: string): string | null {
    return this.parent.get(userId) ?? null;
  }

  edgeOf(userId: string): ReferralEdge | null {
    const referrerId = this.parent.get(userId);
    if (!referrerId) return null;
    return { userId, referrerId, attributedAt: this.at.get(userId)! };
  }

  ancestorsOf(userId: string): string[] {
    return ancestors(this.parent, userId, this.maxDepth);
  }

  /** All edges (audit dump for tests). */
  listEdges(): ReferralEdge[] {
    return [...this.parent.entries()].map(([userId, referrerId]) => ({
      userId,
      referrerId,
      attributedAt: this.at.get(userId)!,
    }));
  }

  /**
   * L3 — direct downline count for a referrer (hop-0 only).
   * Does not invent multi-tier expansion as "followers".
   */
  directDownlineCount(referrerId: string): number {
    let n = 0;
    for (const r of this.parent.values()) {
      if (r === referrerId) n += 1;
    }
    return n;
  }

  /** Direct children user ids (hop-0). */
  directDownline(referrerId: string): readonly string[] {
    const out: string[] = [];
    for (const [userId, r] of this.parent.entries()) {
      if (r === referrerId) out.push(userId);
    }
    return out.sort();
  }

  /**
   * L3 — hop-0 downline counts for many referrers in one pass.
   * Unknown referrers → 0 (never invent edges).
   */
  directDownlineCounts(referrerIds: readonly string[]): Readonly<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const id of referrerIds) {
      out[id] = 0;
    }
    for (const r of this.parent.values()) {
      if (Object.prototype.hasOwnProperty.call(out, r)) {
        out[r] = (out[r] ?? 0) + 1;
      }
    }
    return out;
  }

  /**
   * L3 — max hop-0 downline among referrers (0 if none / empty input).
   */
  maxDirectDownline(referrerIds: readonly string[]): number {
    const counts = this.directDownlineCounts(referrerIds);
    let max = 0;
    for (const n of Object.values(counts)) {
      if (n > max) max = n;
    }
    return max;
  }

  /**
   * L3 — total attribution edges. Empty tree → 0 (never invent).
   */
  edgeCount(): number {
    return this.parent.size;
  }

  /**
   * L3 — whether user has a referrer set. Unknown user → false.
   */
  hasReferrer(userId: string): boolean {
    const id = userId.trim();
    if (!id) return false;
    return this.parent.has(id);
  }

  /**
   * L3 — unique referrer ids currently in the tree (sorted). Empty → [].
   */
  listReferrerIds(): readonly string[] {
    return [...new Set(this.parent.values())].sort();
  }

  /**
   * L3 — users with a parent (sorted). Empty tree → [] (never invent).
   */
  listAttributedUserIds(): readonly string[] {
    return [...this.parent.keys()].sort();
  }

  /**
   * L3 — referrer of user. None → null (never invent edge).
   */
  referrerOf(userId: string): string | null {
    const id = userId.trim();
    if (!id) return null;
    return this.parent.get(id) ?? null;
  }
}
