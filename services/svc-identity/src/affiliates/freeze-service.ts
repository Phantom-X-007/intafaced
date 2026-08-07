import type { Sql } from 'postgres';
import { assertFreezeReason, FreezeError, type FreezeRecord } from './freeze-store.js';

/**
 * Durable affiliate freeze ledger (non-pay).
 * Accrual uses frozenIds(); payout remains Class M residual.
 */

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

  async list(): Promise<FreezeRecord[]> {
    const rows = await this.sql<Array<{ beneficiary_id: string; frozen_by: string; reason: string; frozen_at: Date }>>`
      SELECT beneficiary_id, frozen_by, reason, frozen_at FROM affiliate_freezes ORDER BY frozen_at ASC
    `;
    return rows.map((r) => ({
      beneficiaryId: r.beneficiary_id,
      frozenBy: r.frozen_by,
      reason: r.reason,
      frozenAt: r.frozen_at,
    }));
  }

  async freeze(input: { beneficiaryId: string; frozenBy: string; reason: string }): Promise<FreezeRecord> {
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

  async unfreeze(beneficiaryId: string): Promise<FreezeRecord> {
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
