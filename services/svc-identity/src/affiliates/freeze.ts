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

/** L3 — compare unfrozen vs frozen accrual (dry-run only, no payout). */
export function freezeFilterBoardCard(input: {
  fee: FeeEvent;
  parent: ReadonlyMap<string, string>;
  tiers?: readonly TierRate[];
  frozenBeneficiaryIds: ReadonlySet<string>;
  maxDepth?: number;
}): {
  readonly withoutFreeze: number;
  readonly withFreeze: number;
  readonly skipped: number;
  readonly frozenIds: number;
} {
  const without = accrueCommission({
    fee: input.fee,
    parent: input.parent,
    tiers: input.tiers ?? DEFAULT_ACCRUAL_TIERS,
    maxDepth: input.maxDepth,
  });
  const withF = accrueWithFreezes(input);
  return {
    withoutFreeze: without.length,
    withFreeze: withF.length,
    skipped: Math.max(0, without.length - withF.length),
    frozenIds: input.frozenBeneficiaryIds.size,
  };
}

/** L3 — freeze filter status line. */
export function freezeFilterStatusLine(input: {
  fee: FeeEvent;
  parent: ReadonlyMap<string, string>;
  tiers?: readonly TierRate[];
  frozenBeneficiaryIds: ReadonlySet<string>;
  maxDepth?: number;
}): string {
  const c = freezeFilterBoardCard(input);
  return `without=${c.withoutFreeze} with=${c.withFreeze} skipped=${c.skipped} frozenIds=${c.frozenIds}`;
}

/** L3 — parse freeze filter status. Invalid → null. */
export function parseFreezeFilterStatusLine(
  line: string,
): { readonly without: number; readonly with: number; readonly skipped: number; readonly frozenIds: number } | null {
  const m = line.trim().match(/^without=(\d+) with=(\d+) skipped=(\d+) frozenIds=(\d+)$/);
  if (!m) return null;
  return { without: Number(m[1]), with: Number(m[2]), skipped: Number(m[3]), frozenIds: Number(m[4]) };
}

/** L3 — true when status matches card. */
export function freezeFilterStatusLineMatches(input: {
  fee: FeeEvent;
  parent: ReadonlyMap<string, string>;
  tiers?: readonly TierRate[];
  frozenBeneficiaryIds: ReadonlySet<string>;
  maxDepth?: number;
}): boolean {
  const p = parseFreezeFilterStatusLine(freezeFilterStatusLine(input));
  if (!p) return false;
  const c = freezeFilterBoardCard(input);
  return p.without === c.withoutFreeze && p.with === c.withFreeze && p.skipped === c.skipped && p.frozenIds === c.frozenIds;
}

/** L3 — true when without = with + skipped. */
export function freezeFilterStatusLineConsistent(line: string): boolean {
  const p = parseFreezeFilterStatusLine(line);
  if (!p) return false;
  return p.without === p.with + p.skipped;
}

/** L3 — export header. */
export function freezeFilterExportHeader(): string {
  return 'without,with,skipped,frozenIds';
}

/** L3 — export line. */
export function freezeFilterExportLine(input: {
  fee: FeeEvent;
  parent: ReadonlyMap<string, string>;
  tiers?: readonly TierRate[];
  frozenBeneficiaryIds: ReadonlySet<string>;
  maxDepth?: number;
}): string {
  const c = freezeFilterBoardCard(input);
  return `${c.withoutFreeze},${c.withFreeze},${c.skipped},${c.frozenIds}`;
}

/** L3 — full export. */
export function freezeFilterExportText(input: {
  fee: FeeEvent;
  parent: ReadonlyMap<string, string>;
  tiers?: readonly TierRate[];
  frozenBeneficiaryIds: ReadonlySet<string>;
  maxDepth?: number;
}): string {
  return [freezeFilterExportHeader(), freezeFilterExportLine(input)].join('\n');
}

/** L3 — true when freeze skipped at least n rows. Invalid → false. */
export function freezeSkippedAtLeast(
  input: {
    fee: FeeEvent;
    parent: ReadonlyMap<string, string>;
    tiers?: readonly TierRate[];
    frozenBeneficiaryIds: ReadonlySet<string>;
    maxDepth?: number;
  },
  n: number,
): boolean {
  if (!Number.isFinite(n)) return false;
  return freezeFilterBoardCard(input).skipped >= n;
}
