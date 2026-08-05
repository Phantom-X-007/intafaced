/**
 * Affiliates L3 — beneficiary freeze (non-pay).
 *
 * Frozen beneficiaries are skipped at accrual time. No ledger payout here.
 */

import { accrueCommission, type CommissionRow, type FeeEvent, type TierRate, DEFAULT_ACCRUAL_TIERS } from './commission.js';

/**
 * Accrue commissions skipping frozen beneficiary ids.
 * Freeze is operator control — not a money invent.
 */
export function accrueWithFreezes(input: {
  fee: FeeEvent;
  parent: ReadonlyMap<string, string>;
  tiers?: readonly TierRate[];
  frozenBeneficiaryIds: ReadonlySet<string>;
  maxDepth?: number;
}): CommissionRow[] {
  const rows = accrueCommission({
    fee: input.fee,
    parent: input.parent,
    tiers: input.tiers ?? DEFAULT_ACCRUAL_TIERS,
    maxDepth: input.maxDepth,
  });
  return rows.filter((r) => !input.frozenBeneficiaryIds.has(r.beneficiaryId));
}
