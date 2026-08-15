/**
 * Initial margin for a futures open (trade.futures F2 helper), and THE LEVERAGE
 * CEILING.
 *
 * Pure arithmetic: notional / leverage, floored to integer scaled units via
 * ledger Amount bigints. Engine and risk still own whether the open is allowed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THERE WAS NO CEILING AT ALL, AND THAT IS WHAT THIS FILE IS NOW ALSO FOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `grep -rn "MAX_LEVERAGE\|maxLeverage"` returned nothing on this repository.
 * `position-service.ts` took `leverage` off the request body, this function
 * checked that it was `> 0`, and the only ceiling anywhere in the path was an
 * accident of storage: `positions.leverage` is `numeric(8, 2)`, so the platform
 * would accept **999,999.99x** and answer a request for 1,000,000x with a
 * Postgres `22003` numeric overflow surfacing as a 500.
 *
 * That is indefensible on its own terms, before any exploit is involved. It is
 * also the multiplier on one: 100,000x turned ten USDT of margin into a million
 * of notional, and a mark moved 19% against a thin book paid 190,000 out of the
 * profit pot. The depth requirement in `mark-from-depth.ts` is the other half —
 * it makes the mark expensive to manufacture — and neither half is sufficient
 * alone. **This half is what makes the prize bounded and the margin real.**
 *
 * WHAT LEVERAGE ACTUALLY IS, HERE. Margin is `notional / leverage`, and margin
 * is the only money the trader has at risk in an isolated position
 * (`DIRECTION` §1). So leverage is precisely the ratio between what a mark may
 * be asked to pay out on and what its owner stands to lose for being wrong. An
 * unbounded ratio means an unbounded payout against a bounded stake, which is
 * not a leverage product — it is a free option on the house pot.
 *
 * REFUSED, NOT CLAMPED. A request for 500x is not quietly opened at the cap: the
 * caller asked for a position with a different liquidation price than the one
 * they would get, and silently substituting risk parameters is the same class of
 * mistake as silently substituting a price. `docs/adr/2026-08-05-futures-risk-
 * and-mark-law.md` is explicit for prices — *refuse the request, not
 * ignore-and-substitute, so the caller learns* — and a margin requirement is a
 * price the caller pays.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE NUMBER IS DIRECTION §1. RAISES ARE THE OWNER'S.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `DIRECTION` §1 names max leverage v1 as **10×**. D26-P0-07
 * (`docs/adr/2026-08-13-leverage-defaults-frozen.md`) froze that cell: it is
 * not a placeholder, and agents must not treat unset env as "no cap" or as an
 * excuse to invent 20×. `TRADE_FUTURES_MAX_LEVERAGE` may only TIGHTEN (≤ 10).
 * A value above 10× is a raise and fails boot.
 */
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';

/** DIRECTION §1 / D26-P0-07 — live v1 cap. Not a placeholder. */
export const DEFAULT_MAX_LEVERAGE = '10';
export const DEFAULT_MAX_LEVERAGE_AMOUNT: Amount = parseAmount(DEFAULT_MAX_LEVERAGE);

/** Positive configured cap ≤ 10×, or the DIRECTION default when omitted. */
export function resolveMaxLeverage(configured?: Amount | null): Amount {
  if (configured != null && configured > 0n) {
    if (configured > DEFAULT_MAX_LEVERAGE_AMOUNT) {
      throw new Error(
        'TRADE_FUTURES_MAX_LEVERAGE above 10× is a raise — D26-P0-07 / DIRECTION §1 (docs/adr/2026-08-13-leverage-defaults-frozen.md)',
      );
    }
    return configured;
  }
  return DEFAULT_MAX_LEVERAGE_AMOUNT;
}

/** Parse `TRADE_FUTURES_MAX_LEVERAGE`. Empty → null (code uses 10×). Invalid or >10 → throw at boot. */
export function parseConfiguredMaxLeverage(raw: string): Amount | null {
  const s = raw.trim();
  if (s === '') return null;
  const n = parseAmount(s);
  if (n <= 0n) {
    throw new Error('TRADE_FUTURES_MAX_LEVERAGE must be a positive decimal ≤ 10, or empty (DIRECTION §1 10×)');
  }
  if (n > DEFAULT_MAX_LEVERAGE_AMOUNT) {
    throw new Error(
      'TRADE_FUTURES_MAX_LEVERAGE above 10× is a raise — D26-P0-07 / DIRECTION §1 (docs/adr/2026-08-13-leverage-defaults-frozen.md)',
    );
  }
  return n;
}

/** Leverage was zero, negative, or not a number this path can use. */
export const LEVERAGE_INVALID = 'trade.leverage_invalid';
/** Leverage was positive and above the cap. */
export const LEVERAGE_TOO_HIGH = 'trade.leverage_too_high';

export type LeverageRefusalCode = typeof LEVERAGE_INVALID | typeof LEVERAGE_TOO_HIGH;

export interface LeverageCheck {
  readonly ok: boolean;
  readonly reason?: string;
  /** Present exactly when `ok` is false. */
  readonly code?: LeverageRefusalCode;
}

/**
 * MAY A POSITION BE OPENED AT THIS LEVERAGE?
 *
 * Pure, and returns a refusal rather than throwing, so the caller can decide the
 * HTTP shape and — more importantly — can run it BEFORE it locks any margin or
 * writes any row. `position-service.ts` calls it before the ledger post, which
 * is what turns the `numeric(8, 2)` overflow from a 500 with a compensating
 * release into a 400 that never moved anything.
 */
export function checkLeverage(leverage: Amount, maximum: Amount): LeverageCheck {
  if (leverage <= 0n) {
    return { ok: false, code: LEVERAGE_INVALID, reason: `leverage must be greater than zero, got ${formatAmount(leverage)}` };
  }
  if (leverage > maximum) {
    return {
      ok: false,
      code: LEVERAGE_TOO_HIGH,
      reason: `leverage ${formatAmount(leverage)}x exceeds the maximum of ${formatAmount(maximum)}x on this deployment`,
    };
  }
  return { ok: true };
}

export function initialMargin(input: { size: Amount; entryPrice: Amount; leverage: Amount }): Amount {
  if (input.size <= 0n) throw new Error('size must be positive');
  if (input.entryPrice <= 0n) throw new Error('entryPrice must be positive');
  if (input.leverage <= 0n) throw new Error('leverage must be positive');
  // Amounts are scaled integers (18dp). notional = size * entry / SCALE;
  // leverage is also scaled, so margin = notional * SCALE / leverage.
  const SCALE = 10n ** 18n;
  const notional = (input.size * input.entryPrice) / SCALE;
  const margin = (notional * SCALE) / input.leverage;
  if (margin <= 0n) throw new Error('initial margin rounds to zero — raise size/price or lower leverage');
  return margin;
}

/** Test helper: parse decimal strings into Amounts then compute. */
export function initialMarginFromDecimals(size: string, entryPrice: string, leverage: string): string {
  const m = initialMargin({
    size: parseAmount(size),
    entryPrice: parseAmount(entryPrice),
    leverage: parseAmount(leverage),
  });
  // format as integer string of scaled amount is internal; tests compare via parse
  return m.toString();
}
