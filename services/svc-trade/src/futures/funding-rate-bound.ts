/**
 * Funding rate absolute magnitude bound (BUILD-STOP D2 / promise C12).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Nothing bounded a published period rate. `"1000000"` was a valid decimal and
 * charged as 1,000,000 × notional — the largest unbounded money lever on the
 * funding path. The publisher was trusted completely.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE IS, AND DELIBERATELY IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It is THE MECHANISM: `|rate|` must be ≤ an operator-supplied absolute max
 * before publish or settlement may move money. Unset max = refuse application
 * (fail-closed). Malformed max = refuse config.
 *
 * It is NOT the product ceiling number. That number is owner law
 * (`docs/BUILD-STOP-TRADE-2026-08-08.md` D2 / Denon). There is no default such
 * as `"0.01"` or `"10%"` written here — inventing one would dress residual as
 * law. Operators set `TRADE_FUTURES_FUNDING_MAX_ABS_RATE` to a positive decimal
 * string in the same units as the period rate (absolute, not bps).
 *
 * When funding markets are listed (`TRADE_FUTURES_FUNDING_MARKET_IDS` non-empty)
 * the max is required at boot — scheduling funding without a bound is not a
 * deploy state this service will enter.
 */
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';

export type FundingRateBoundCode =
  'trade.funding_rate_bound_unconfigured' | 'trade.funding_rate_bound_invalid' | 'trade.funding_rate_exceeds_max';

export class FundingRateBoundError extends Error {
  readonly code: FundingRateBoundCode;

  constructor(code: FundingRateBoundCode, message: string) {
    super(message);
    this.name = 'FundingRateBoundError';
    this.code = code;
  }
}

/**
 * Parse `TRADE_FUTURES_FUNDING_MAX_ABS_RATE`.
 *
 * Empty → `null` (unset; settle/publish must refuse rate application).
 * Present but not a positive absolute decimal → throws (typo at boot / wire).
 */
export function parseFundingMaxAbsRate(raw: string | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return null;
  // Absolute bound only — sign would be a second decision about floor/ceiling.
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new FundingRateBoundError(
      'trade.funding_rate_bound_invalid',
      `TRADE_FUTURES_FUNDING_MAX_ABS_RATE must be a positive absolute decimal string (no sign), got "${raw}"`,
    );
  }
  let value: Amount;
  try {
    value = parseAmount(trimmed);
  } catch {
    throw new FundingRateBoundError(
      'trade.funding_rate_bound_invalid',
      `TRADE_FUTURES_FUNDING_MAX_ABS_RATE is not a parseable ledger decimal: "${raw}"`,
    );
  }
  if (value <= 0n) {
    throw new FundingRateBoundError(
      'trade.funding_rate_bound_invalid',
      'TRADE_FUTURES_FUNDING_MAX_ABS_RATE must be > 0 — a zero max would refuse every rate including the legitimate ones',
    );
  }
  // Canonical decimal form (strip accidental leading zeros via format).
  return formatAmount(value);
}

/**
 * Boot gate: funding market list non-empty requires a configured max.
 *
 * Returns the parsed max (possibly null when no markets listed and max unset).
 * Does not invent a ceiling when markets are empty — publish/settle still
 * fail-closed if max is null when a rate is applied.
 */
export function resolveFundingMaxAbsRateForBoot(input: {
  fundingMarketIds: readonly string[];
  maxAbsRateRaw: string | undefined;
}): string | null {
  const max = parseFundingMaxAbsRate(input.maxAbsRateRaw);
  if (input.fundingMarketIds.length > 0 && max === null) {
    throw new FundingRateBoundError(
      'trade.funding_rate_bound_unconfigured',
      'TRADE_FUTURES_FUNDING_MAX_ABS_RATE is required when TRADE_FUTURES_FUNDING_MARKET_IDS is non-empty. ' +
        'There is no product default for the ceiling (owner residual D2 / BUILD-STOP). ' +
        'Set a positive absolute period-rate decimal, or clear the funding market list.',
    );
  }
  return max;
}

function absAmount(a: Amount): Amount {
  return a < 0n ? -a : a;
}

/**
 * Refuse when the bound is unpublished or the rate exceeds it.
 *
 * Call on publish AND on settle plan — either path alone would leave a hole
 * (oracle posts into memory without HTTP; tick settles a seeded book).
 */
export function assertFundingRateWithinBound(rate: string, maxAbsRate: string | null | undefined): void {
  if (maxAbsRate == null || maxAbsRate.trim() === '') {
    throw new FundingRateBoundError(
      'trade.funding_rate_bound_unconfigured',
      'TRADE_FUTURES_FUNDING_MAX_ABS_RATE is not set — refusing to apply a funding rate with no absolute magnitude bound ' +
        '(unpublished bound = refuse; owner residual D2, no invented product ceiling)',
    );
  }
  // Re-validate so a hand-rolled dep cannot smuggle garbage past boot parse.
  const maxCanonical = parseFundingMaxAbsRate(maxAbsRate);
  if (maxCanonical === null) {
    throw new FundingRateBoundError(
      'trade.funding_rate_bound_unconfigured',
      'TRADE_FUTURES_FUNDING_MAX_ABS_RATE is not set — refusing funding rate application',
    );
  }

  let rateAmt: Amount;
  try {
    rateAmt = parseAmount(rate.trim());
  } catch {
    throw new FundingRateBoundError('trade.funding_rate_bound_invalid', `funding rate must be a decimal string, got "${rate}"`);
  }

  const rateAbs = absAmount(rateAmt);
  const maxAmt = parseAmount(maxCanonical);
  if (rateAbs > maxAmt) {
    throw new FundingRateBoundError(
      'trade.funding_rate_exceeds_max',
      `funding rate |${formatAmount(rateAmt)}| exceeds TRADE_FUTURES_FUNDING_MAX_ABS_RATE ${maxCanonical} — refusing rather than charging ${formatAmount(rateAbs)} × notional`,
    );
  }
}
