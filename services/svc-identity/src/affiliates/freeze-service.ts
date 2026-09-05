import type { Sql } from 'postgres';
import { assertFreezeReason, FreezeError, type FreezeRecord } from './freeze-store.js';

/**
 * Durable affiliate freeze ledger (non-pay).
 * Accrual uses frozenIds(); payout skips frozen beneficiaries via the same set.
 */

/** Blank / non-integer / out of 1..500 affiliates.freezes window. Never invent 100. */
export const IDENTITY_AFFILIATE_FREEZES_LIMIT_UNSET = 'identity.affiliate_freezes_limit_unset' as const;
export const AFFILIATE_FREEZES_LIMIT_MAX = 500;

export class AffiliateFreezesLimitUnsetError extends Error {
  constructor(
    message: string,
    readonly code: typeof IDENTITY_AFFILIATE_FREEZES_LIMIT_UNSET,
  ) {
    super(message);
    this.name = 'AffiliateFreezesLimitUnsetError';
  }
}

/** Owner-published freeze roster window. Missing / null / non-int / out of 1..max refuses. Never invent 100. */
export function publishedAffiliateFreezesLimit(value: number | undefined | null): number {
  if (value === undefined || value === null || !Number.isInteger(value) || value < 1 || value > AFFILIATE_FREEZES_LIMIT_MAX) {
    throw new AffiliateFreezesLimitUnsetError(
      'Affiliate freezes limit is unset — refuse to invent 100',
      IDENTITY_AFFILIATE_FREEZES_LIMIT_UNSET,
    );
  }
  return value;
}

export class FreezeService {
  constructor(private readonly sql: Sql) {}

  async isFrozen(beneficiaryId: string): Promise<boolean> {
    const rows = await this.sql<Array<{ beneficiary_id: string }>>`
      SELECT beneficiary_id FROM affiliate_freezes WHERE beneficiary_id = ${beneficiaryId}
    `;
    return rows.length > 0;
  }

  async frozenIds(): Promise<ReadonlySet<string>> {
    const rows = await this.sql<Array<{ beneficiary_id: string }>>`
      SELECT beneficiary_id FROM affiliate_freezes
    `;
    return new Set(rows.map((r) => r.beneficiary_id));
  }

  async list(limit: number): Promise<FreezeRecord[]> {
    const published = publishedAffiliateFreezesLimit(limit);
    const rows = await this.sql<Array<{ beneficiary_id: string; frozen_by: string; reason: string; frozen_at: Date }>>`
      SELECT beneficiary_id, frozen_by, reason, frozen_at FROM affiliate_freezes ORDER BY frozen_at ASC
      LIMIT ${published}
    `;
    return rows.map((r) => ({
      beneficiaryId: r.beneficiary_id,
      frozenBy: r.frozen_by,
      reason: r.reason,
      frozenAt: r.frozen_at,
    }));
  }

  async freeze(input: {
    beneficiaryId: string;
    frozenBy: string;
    reason: string;
    /** Threaded so boot dual-control wrap can see the second actor. Unused by SQL. */
    confirmActorId?: string | null;
  }): Promise<FreezeRecord> {
    const beneficiaryId = input.beneficiaryId?.trim() ?? '';
    const frozenBy = input.frozenBy?.trim() ?? '';
    if (!beneficiaryId || !frozenBy) throw new FreezeError('beneficiaryId and frozenBy required', 'freeze.invalid');
    const reason = assertFreezeReason(input.reason);

    const exists = await this.sql<Array<{ id: string }>>`
      SELECT id FROM users WHERE id = ${beneficiaryId} LIMIT 1
    `;
    if (!exists[0]) throw new FreezeError('Beneficiary not found', 'freeze.not_found');

    try {
      const rows = await this.sql<Array<{ beneficiary_id: string; frozen_by: string; reason: string; frozen_at: Date }>>`
        INSERT INTO affiliate_freezes (beneficiary_id, frozen_by, reason, frozen_at)
        VALUES (${beneficiaryId}, ${frozenBy}, ${reason}, now())
        RETURNING beneficiary_id, frozen_by, reason, frozen_at
      `;
      return {
        beneficiaryId: rows[0]!.beneficiary_id,
        frozenBy: rows[0]!.frozen_by,
        reason: rows[0]!.reason,
        frozenAt: rows[0]!.frozen_at,
      };
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === '23505') throw new FreezeError('Already frozen', 'freeze.already');
      throw err;
    }
  }

  async unfreeze(
    beneficiaryId: string,
    cmd?: { readonly actorId?: string | null; readonly confirmActorId?: string | null },
  ): Promise<FreezeRecord> {
    void cmd;
    const id = beneficiaryId.trim();
    if (!id) throw new FreezeError('beneficiaryId required', 'freeze.invalid');
    const rows = await this.sql<Array<{ beneficiary_id: string; frozen_by: string; reason: string; frozen_at: Date }>>`
      DELETE FROM affiliate_freezes WHERE beneficiary_id = ${id}
      RETURNING beneficiary_id, frozen_by, reason, frozen_at
    `;
    if (!rows[0]) throw new FreezeError('Not frozen', 'freeze.not_frozen');
    return {
      beneficiaryId: rows[0].beneficiary_id,
      frozenBy: rows[0].frozen_by,
      reason: rows[0].reason,
      frozenAt: rows[0].frozen_at,
    };
  }
}
