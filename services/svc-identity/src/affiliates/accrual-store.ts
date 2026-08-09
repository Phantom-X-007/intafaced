import type { Sql } from 'postgres';
import type { CommissionRow } from './commission.js';

/**
 * Durable Slice B accrual rows (TRK-ops.affiliates).
 *
 * Stores fee-event → commission decimal strings. Never posts ledger.
 * Slice C payout (`payout-engine.ts`) posts only when owner rates are published
 * and a ledger client is wired — refuse-closed otherwise, never invents rates.
 */

export interface AccrualStore {
  /** Idempotent insert of computed rows for one fee event. Returns stored count. */
  saveRows(rows: readonly CommissionRow[]): Promise<number>;
  listByFeeEvent(feeEventId: string): Promise<readonly CommissionRow[]>;
  listByBeneficiary(beneficiaryId: string, limit?: number): Promise<readonly CommissionRow[]>;
}

type AccrualRow = {
  fee_event_id: string;
  beneficiary_id: string;
  payer_id: string;
  hop: number;
  rate: string;
  fee_amount: string;
  commission_amount: string;
  asset: string;
  accrued_at: Date;
};

function toRow(r: AccrualRow): CommissionRow {
  return {
    feeEventId: r.fee_event_id,
    beneficiaryId: r.beneficiary_id,
    payerId: r.payer_id,
    hop: r.hop,
    rate: r.rate,
    feeAmount: r.fee_amount,
    commissionAmount: r.commission_amount,
    asset: r.asset,
    accruedAt: r.accrued_at instanceof Date ? r.accrued_at : new Date(r.accrued_at),
  };
}

/** In-memory store for unit tests. */
export class MemoryAccrualStore implements AccrualStore {
  private readonly rows: CommissionRow[] = [];

  async saveRows(rows: readonly CommissionRow[]): Promise<number> {
    let n = 0;
    for (const r of rows) {
      const exists = this.rows.some((x) => x.feeEventId === r.feeEventId && x.beneficiaryId === r.beneficiaryId && x.hop === r.hop);
      if (exists) continue;
      this.rows.push(r);
      n += 1;
    }
    return n;
  }

  async listByFeeEvent(feeEventId: string): Promise<readonly CommissionRow[]> {
    return this.rows.filter((r) => r.feeEventId === feeEventId);
  }

  async listByBeneficiary(beneficiaryId: string, limit = 100): Promise<readonly CommissionRow[]> {
    return this.rows.filter((r) => r.beneficiaryId === beneficiaryId).slice(0, Math.min(Math.max(limit, 1), 500));
  }
}

export class SqlAccrualStore implements AccrualStore {
  constructor(private readonly sql: Sql) {}

  async saveRows(rows: readonly CommissionRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    let inserted = 0;
    for (const r of rows) {
      const result = await this.sql`
        INSERT INTO affiliate_commission_accruals (
          fee_event_id, beneficiary_id, payer_id, hop, rate,
          fee_amount, commission_amount, asset, accrued_at
        ) VALUES (
          ${r.feeEventId}, ${r.beneficiaryId}, ${r.payerId}, ${r.hop}, ${r.rate},
          ${r.feeAmount}, ${r.commissionAmount}, ${r.asset}, ${r.accruedAt}
        )
        ON CONFLICT (fee_event_id, beneficiary_id, hop) DO NOTHING
        RETURNING id
      `;
      if (result.count > 0) inserted += 1;
    }
    return inserted;
  }

  async listByFeeEvent(feeEventId: string): Promise<readonly CommissionRow[]> {
    const rows = await this.sql<AccrualRow[]>`
      SELECT fee_event_id, beneficiary_id, payer_id, hop, rate,
             fee_amount, commission_amount, asset, accrued_at
        FROM affiliate_commission_accruals
       WHERE fee_event_id = ${feeEventId}
       ORDER BY hop ASC
    `;
    return rows.map(toRow);
  }

  async listByBeneficiary(beneficiaryId: string, limit = 100): Promise<readonly CommissionRow[]> {
    const lim = Math.min(Math.max(limit, 1), 500);
    const rows = await this.sql<AccrualRow[]>`
      SELECT fee_event_id, beneficiary_id, payer_id, hop, rate,
             fee_amount, commission_amount, asset, accrued_at
        FROM affiliate_commission_accruals
       WHERE beneficiary_id = ${beneficiaryId}
       ORDER BY accrued_at DESC
       LIMIT ${lim}
    `;
    return rows.map(toRow);
  }
}
