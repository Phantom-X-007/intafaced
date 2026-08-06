/**
 * AFFILIATE COMMISSION ACCRUAL — Slice B (TRK-ops.affiliates).
 *
 * Fee event → commission rows as decimal strings. NO payout, NO ledger post.
 * Slice C (Class M) owns payout automation via ledger recipes.
 *
 * Law:
 *   · zero volume / zero fee → zero commission (not invent)
 *   · rates are decimal strings in [0,1]; product may set; never float math
 *   · multi-tier splits along referral ancestors (Slice A tree)
 *   · money fields are always decimal strings
 */

import { ancestors, DEFAULT_MAX_REFERRAL_DEPTH } from './referral-tree.js';

export type CommissionErrorCode = 'commission.invalid' | 'commission.rate' | 'commission.fee';

export class CommissionError extends Error {
  constructor(
    message: string,
    readonly code: CommissionErrorCode,
  ) {
    super(message);
    this.name = 'CommissionError';
  }
}

/** One fee event that may generate commission (already settled elsewhere). */
export type FeeEvent = {
  readonly feeEventId: string;
  readonly userId: string;
  /** Fee notional as decimal string (quote). */
  readonly feeAmount: string;
  readonly asset: string;
  readonly at: Date;
};

export type TierRate = {
  /** 0-based hop from the fee payer (0 = direct referrer). */
  readonly hop: number;
  /** Fraction of fee, decimal string in [0,1], e.g. "0.10". */
  readonly rate: string;
};

export type CommissionRow = {
  readonly feeEventId: string;
  readonly beneficiaryId: string;
  readonly payerId: string;
  readonly hop: number;
  readonly rate: string;
  readonly feeAmount: string;
  readonly commissionAmount: string;
  readonly asset: string;
  readonly accruedAt: Date;
};

const AMOUNT_RE = /^(0|[1-9]\d*)(\.\d{1,18})?$/;
const RATE_RE = /^(0(\.\d{1,18})?|1(\.0{1,18})?)$/;

function assertAmount(s: string, code: CommissionErrorCode): string {
  const t = s.trim();
  if (!AMOUNT_RE.test(t)) throw new CommissionError(`Invalid amount "${s}"`, code);
  return t;
}

function assertRate(s: string): string {
  const t = s.trim();
  if (!RATE_RE.test(t)) throw new CommissionError(`Invalid rate "${s}"`, 'commission.rate');
  return t;
}

/** Multiply two non-negative decimal strings → decimal string (truncate to 18dp). */
export function decimalMul(a: string, b: string, dp = 18): string {
  const aa = assertAmount(a, 'commission.fee');
  const bb = assertAmount(b, 'commission.rate');
  // scale to bigint
  const [aw, af = ''] = aa.split('.') as [string, string?];
  const [bw, bf = ''] = bb.split('.') as [string, string?];
  const as = aw + af.padEnd(18, '0').slice(0, 18);
  const bs = bw + bf.padEnd(18, '0').slice(0, 18);
  const prod = BigInt(as) * BigInt(bs); // scale 36
  const scale = 36n;
  const outScale = BigInt(dp);
  const div = 10n ** (scale - outScale);
  const whole = prod / div;
  const neg = whole < 0n;
  const abs = neg ? -whole : whole;
  const str = abs.toString().padStart(dp + 1, '0');
  const w = str.slice(0, str.length - dp) || '0';
  const f = str.slice(str.length - dp);
  const trimmed = f.replace(/0+$/, '');
  const body = trimmed.length ? `${w}.${trimmed}` : w;
  return neg ? `-${body}` : body;
}

/**
 * Accrue commission rows for one fee event against a referral parent map.
 * Zero fee → empty rows (explicit).
 */
export function accrueCommission(input: {
  fee: FeeEvent;
  parent: ReadonlyMap<string, string>;
  tiers: readonly TierRate[];
  maxDepth?: number;
}): CommissionRow[] {
  const feeAmount = assertAmount(input.fee.feeAmount, 'commission.fee');
  if (feeAmount === '0' || /^0+(\.0+)?$/.test(feeAmount)) {
    return [];
  }
  if (!input.tiers.length) {
    throw new CommissionError('At least one tier rate is required', 'commission.rate');
  }
  const maxDepth = input.maxDepth ?? DEFAULT_MAX_REFERRAL_DEPTH;
  const chain = ancestors(input.parent, input.fee.userId, maxDepth);
  const rows: CommissionRow[] = [];
  for (const tier of input.tiers) {
    if (!Number.isInteger(tier.hop) || tier.hop < 0) {
      throw new CommissionError('hop must be a non-negative integer', 'commission.invalid');
    }
    const rate = assertRate(tier.rate);
    if (rate === '0' || /^0+(\.0+)?$/.test(rate)) continue;
    const beneficiaryId = chain[tier.hop];
    if (!beneficiaryId) continue; // no ancestor at this hop
    const commissionAmount = decimalMul(feeAmount, rate);
    if (commissionAmount === '0' || /^0+(\.0+)?$/.test(commissionAmount)) continue;
    rows.push({
      feeEventId: input.fee.feeEventId,
      beneficiaryId,
      payerId: input.fee.userId,
      hop: tier.hop,
      rate,
      feeAmount,
      commissionAmount,
      asset: input.fee.asset,
      accruedAt: input.fee.at,
    });
  }
  return rows;
}

/** Default demo tiers — product law may replace; tests pin exact strings. */
export const DEFAULT_ACCRUAL_TIERS: readonly TierRate[] = [
  { hop: 0, rate: '0.10' },
  { hop: 1, rate: '0.05' },
  { hop: 2, rate: '0.02' },
];

/**
 * L3 — dry-run summary of accrued rows (no payout). Totals are decimal strings.
 * Empty rows → total "0" (honest zero after zero fee, not invent).
 */
export type CommissionSummary = {
  readonly rowCount: number;
  readonly byBeneficiary: Readonly<Record<string, string>>;
  readonly totalCommission: string;
  readonly asset: string | null;
};

export function summarizeCommissionRows(rows: readonly CommissionRow[]): CommissionSummary {
  if (rows.length === 0) {
    return { rowCount: 0, byBeneficiary: {}, totalCommission: '0', asset: null };
  }
  const byBeneficiary: Record<string, string> = {};
  let total = '0';
  let asset: string | null = rows[0]!.asset;
  for (const r of rows) {
    if (asset !== null && r.asset !== asset) {
      throw new CommissionError('Cannot summarize mixed assets in one dry-run', 'commission.invalid');
    }
    asset = r.asset;
    byBeneficiary[r.beneficiaryId] = decimalAdd(byBeneficiary[r.beneficiaryId] ?? '0', r.commissionAmount);
    total = decimalAdd(total, r.commissionAmount);
  }
  return { rowCount: rows.length, byBeneficiary, totalCommission: total, asset };
}

/**
 * L3 — hop histogram for dry-run rows (no payout). Empty → empty map.
 */
export function countCommissionRowsByHop(rows: readonly CommissionRow[]): Readonly<Record<number, number>> {
  const out: Record<number, number> = {};
  for (const r of rows) {
    out[r.hop] = (out[r.hop] ?? 0) + 1;
  }
  return out;
}

/**
 * L3 — distinct beneficiary ids from dry-run rows (sorted). Empty → [].
 * Does not invent payouts or rates.
 */
export function listCommissionBeneficiaryIds(rows: readonly CommissionRow[]): readonly string[] {
  return [...new Set(rows.map((r) => r.beneficiaryId))].sort();
}

/**
 * L3 — max hop index present in dry-run rows. Empty → null (not invent hop 0).
 */
export function maxCommissionHop(rows: readonly CommissionRow[]): number | null {
  if (rows.length === 0) return null;
  let max = rows[0]!.hop;
  for (const r of rows) {
    if (r.hop > max) max = r.hop;
  }
  return max;
}

/** Add two non-negative decimal strings (truncate to 18dp). */
export function decimalAdd(a: string, b: string, dp = 18): string {
  const aa = assertAmount(a, 'commission.fee');
  const bb = assertAmount(b, 'commission.fee');
  const [aw, af = ''] = aa.split('.') as [string, string?];
  const [bw, bf = ''] = bb.split('.') as [string, string?];
  const as = BigInt(aw + af.padEnd(dp, '0').slice(0, dp));
  const bs = BigInt(bw + bf.padEnd(dp, '0').slice(0, dp));
  const sum = as + bs;
  const str = sum.toString().padStart(dp + 1, '0');
  const w = str.slice(0, str.length - dp) || '0';
  const f = str.slice(str.length - dp).replace(/0+$/, '');
  return f.length ? `${w}.${f}` : w;
}

/** L3 — commission summary board card (dry-run only). */
export function commissionSummaryBoardCard(summary: CommissionSummary): {
  readonly rowCount: number;
  readonly total: string;
  readonly asset: string;
  readonly beneficiaryCount: number;
} {
  return {
    rowCount: summary.rowCount,
    total: summary.totalCommission,
    asset: summary.asset ?? '-',
    beneficiaryCount: Object.keys(summary.byBeneficiary).length,
  };
}

/** L3 — status line (decimal total as string, never number). */
export function commissionSummaryStatusLine(summary: CommissionSummary): string {
  const c = commissionSummaryBoardCard(summary);
  return `rows=${c.rowCount} beneficiaries=${c.beneficiaryCount} total=${c.total} asset=${c.asset}`;
}

/** L3 — true when rowCount is 0. */
export function commissionSummaryStatusLineIsEmpty(summary: CommissionSummary): boolean {
  return summary.rowCount === 0;
}

/** L3 — parse status. Invalid → null. */
export function parseCommissionSummaryStatusLine(
  line: string,
): { readonly rows: number; readonly beneficiaries: number; readonly total: string; readonly asset: string } | null {
  const m = line.trim().match(/^rows=(\d+) beneficiaries=(\d+) total=([0-9.]+) asset=(\S+)$/);
  if (!m) return null;
  return { rows: Number(m[1]), beneficiaries: Number(m[2]), total: m[3]!, asset: m[4]! };
}

/** L3 — true when status matches summary. */
export function commissionSummaryStatusLineMatches(summary: CommissionSummary): boolean {
  const p = parseCommissionSummaryStatusLine(commissionSummaryStatusLine(summary));
  if (!p) return false;
  const c = commissionSummaryBoardCard(summary);
  return p.rows === c.rowCount && p.beneficiaries === c.beneficiaryCount && p.total === c.total && p.asset === c.asset;
}

/** L3 — export header. */
export function commissionSummaryExportHeader(): string {
  return 'rowCount,beneficiaryCount,totalCommission,asset';
}

/** L3 — export line. */
export function commissionSummaryExportLine(summary: CommissionSummary): string {
  const c = commissionSummaryBoardCard(summary);
  return `${c.rowCount},${c.beneficiaryCount},${c.total},${c.asset}`;
}

/** L3 — full export. */
export function commissionSummaryExportText(summary: CommissionSummary): string {
  return [commissionSummaryExportHeader(), commissionSummaryExportLine(summary)].join('\n');
}

/** L3 — true when rowCount is within [min,max]. Invalid → false. */
export function commissionRowCountInRange(summary: CommissionSummary, min: number, max: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  return summary.rowCount >= min && summary.rowCount <= max;
}

/** L3 — true when total is the honest zero string. */
export function commissionSummaryIsZero(summary: CommissionSummary): boolean {
  return summary.totalCommission === '0' || summary.totalCommission === '0.0';
}
