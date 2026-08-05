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
