import type { Sql } from 'postgres';
import { DEFAULT_MAX_REFERRAL_DEPTH, ReferralError, ancestors, chainDepth, wouldCreateCycle, type ReferralEdge } from './referral-tree.js';

/**
 * Durable referral tree (Slice A) — attribution only, no commission/payout.
 */

export class ReferralService {
  constructor(
    private readonly sql: Sql,
    private readonly maxDepth: number = DEFAULT_MAX_REFERRAL_DEPTH,
  ) {}

  /** Parent map for accrual dry-run (userId → referrerId). */
  async loadParentMap(): Promise<Map<string, string>> {
    const rows = await this.sql<Array<{ user_id: string; referrer_id: string }>>`
      SELECT user_id, referrer_id FROM referral_edges
    `;
    return new Map(rows.map((r) => [r.user_id, r.referrer_id]));
  }

  private async userExists(userId: string): Promise<boolean> {
    const rows = await this.sql<Array<{ id: string }>>`
      SELECT id FROM users WHERE id = ${userId} LIMIT 1
    `;
    return rows.length > 0;
  }

  async attribute(input: { userId: string; referrerId: string }): Promise<ReferralEdge> {
    const userId = input.userId.trim();
    const referrerId = input.referrerId.trim();
    if (!userId || !referrerId) {
      throw new ReferralError('userId and referrerId are required', 'referral.invalid');
    }
    if (userId === referrerId) {
      throw new ReferralError('Self-referral is refused', 'referral.self');
    }
    if (!(await this.userExists(userId)) || !(await this.userExists(referrerId))) {
      throw new ReferralError('Referrer is not a known user', 'referral.unknown_referrer');
    }

    const parent = await this.loadParentMap();
    if (parent.has(userId)) {
      throw new ReferralError('Referral already set for this user', 'referral.already_set');
    }
    if (wouldCreateCycle(parent, userId, referrerId)) {
      throw new ReferralError('Referral would create a cycle', 'referral.cycle');
    }
    const referrerDepth = chainDepth(parent, referrerId);
    if (referrerDepth + 1 > this.maxDepth) {
      throw new ReferralError(`Referral depth exceeds max ${this.maxDepth} (referrer chain is already ${referrerDepth})`, 'referral.depth');
    }

    try {
      const rows = await this.sql<Array<{ user_id: string; referrer_id: string; attributed_at: Date }>>`
        INSERT INTO referral_edges (user_id, referrer_id, attributed_at)
        VALUES (${userId}, ${referrerId}, now())
        RETURNING user_id, referrer_id, attributed_at
      `;
      return {
        userId: rows[0]!.user_id,
        referrerId: rows[0]!.referrer_id,
        attributedAt: rows[0]!.attributed_at,
      };
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === '23505') {
        throw new ReferralError('Referral already set for this user', 'referral.already_set');
      }
      throw err;
    }
  }

  async parentOf(userId: string): Promise<string | null> {
    const rows = await this.sql<Array<{ referrer_id: string }>>`
      SELECT referrer_id FROM referral_edges WHERE user_id = ${userId}
    `;
    return rows[0]?.referrer_id ?? null;
  }

  async edgeOf(userId: string): Promise<ReferralEdge | null> {
    const rows = await this.sql<Array<{ user_id: string; referrer_id: string; attributed_at: Date }>>`
      SELECT user_id, referrer_id, attributed_at FROM referral_edges WHERE user_id = ${userId}
    `;
    if (!rows[0]) return null;
    return {
      userId: rows[0].user_id,
      referrerId: rows[0].referrer_id,
      attributedAt: rows[0].attributed_at,
    };
  }

  async ancestorsOf(userId: string): Promise<string[]> {
    const parent = await this.loadParentMap();
    return ancestors(parent, userId, this.maxDepth);
  }
}
