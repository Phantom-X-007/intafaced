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
 * THE NUMBER IS THE OWNER'S. THE MECHANISM IS NOT.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `DIRECTION` §8 item 8 reserves "leverage, margin and liquidation parameters
 * beyond §1's stated defaults" to the owner, and §1 states no leverage default,
 * so the maximum is unruled. What is implemented here is the MECHANISM and its
 * refusal. The number is a conservative placeholder in exactly one named
 * constant, it is injectable per deployment through
 * `PositionServiceDeps.maxLeverage` so the ruling has one place to land, and it
 * is reported for a ruling rather than presented as decided.
 */
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';

/**
 * MAXIMUM LEVERAGE ON A FUTURES OPEN. Decimal string, same units as the request.
 *
 * `10` — a tenth of the notional posted as margin. Chosen conservatively and
 * deliberately at the low end, for three reasons that are all about being wrong
 * in the cheap direction:
 *
 *   · **It is the highest number this repository has ever actually exercised.**
 *     Every existing futures test opens at 1x, 2x, 5x or 10x, and
 *     `maintenance-ladder.test.ts` generates its property cases over `2..10`. A
 *     cap at the top of the tested range refuses nothing anybody has run and
 *     nothing the maintenance ladder has been shown to survive.
 *   · **Nothing above it has a maintenance ladder that is known to hold.** The
 *     ladder's own header calls its parameters placeholders awaiting the same
 *     ruling; a 100x position is liquidated by a 1% move, which on a book this
 *     thin is a rounding error, and the ladder has not been sized for that.
 *   · **Raising a cap is a decision; lowering one is a migration.** Positions
 *     opened above a limit that is later imposed have to be handled, and the
 *     cheap direction of error is the one where nobody is holding a position
 *     the platform has since decided it should not have written.
 *
 * IT IS A PLACEHOLDER AWAITING AN OWNER RULING, NOT A CONSIDERED PRODUCT LIMIT.
 * A real exchange offering perps at 10x is offering a conservative product; that
 * may be the wrong product, and choosing is not an agent's call.
 */
export const DEFAULT_MAX_LEVERAGE = '10';

/** The cap as an Amount. One place, so no call site re-parses the string. */
export function maxLeverage(configured?: Amount | null): Amount {
  if (configured != null && configured > 0n) return configured;
  return parseAmount(DEFAULT_MAX_LEVERAGE);
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
export function checkLeverage(leverage: Amount, maximum: Amount = maxLeverage()): LeverageCheck {
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
