import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client/money';

/**
 * DISPLAY FORMATTING — the last place money could go wrong, so it does not.
 *
 * The rule for this whole app: a decimal string arrives from the wire, becomes
 * a scaled bigint via `parseAmount`, and becomes a string again for the DOM.
 * `Number` is never in that chain. Not for a price, not for a size, and above
 * all not for a cumulative total — 0.1 + 0.2 is wrong in the last decimal place
 * on every row of a depth ladder below the top one, and a ladder is nothing but
 * cumulative sums.
 *
 * The two places a float is legitimate here are marked, and neither is a value
 * a user reads as a number: a depth-bar width, and a basis-point count.
 */

export type { Amount };
export { formatAmount, parseAmount };

/** Parse, or null. Wire data has been zod-checked; this is the belt to that brace. */
export function tryParseAmount(input: string): Amount | null {
  try {
    return parseAmount(input);
  } catch {
    return null;
  }
}

/**
 * Fixed decimal places, by string surgery on the canonical form.
 *
 * `formatAmount` trims trailing zeros, which is right for a ledger and wrong
 * for a price column — a book where one row reads `68412.5` and the next
 * `68412.45` cannot be scanned. Padding and truncating happen on the digits,
 * never via `toFixed`.
 */
export function toFixedString(value: Amount, dp: number): string {
  const canonical = formatAmount(value);
  const negative = canonical.startsWith('-');
  const abs = negative ? canonical.slice(1) : canonical;
  const [whole = '0', frac = ''] = abs.split('.');

  if (dp === 0) return `${negative ? '-' : ''}${whole}`;
  const padded = frac.length >= dp ? frac.slice(0, dp) : frac.padEnd(dp, '0');
  return `${negative ? '-' : ''}${whole}.${padded}`;
}

/** Thousands separators, inserted into the digit string. No locale number path. */
export function group(value: string): string {
  const negative = value.startsWith('-');
  const abs = negative ? value.slice(1) : value;
  const [whole = '0', frac] = abs.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${frac === undefined ? '' : `.${frac}`}`;
}

/**
 * How many decimal places a market quotes at, from its tick or lot size.
 *
 * Precision is a property of the market, not of the renderer. `0.01` → 2.
 */
export function decimalsOf(sizeString: string): number {
  const dot = sizeString.indexOf('.');
  if (dot === -1) return 0;
  return sizeString.slice(dot + 1).replace(/0+$/, '').length;
}

export function displayAmount(value: Amount, dp: number): string {
  return group(toFixedString(value, dp));
}

/**
 * Ratio of one amount to another, as a 0–1 float, for a bar width ONLY.
 *
 * Legitimately a float: it is a CSS length, and no user reads it as a quantity.
 * Computed by scaling in bigint first so the division that loses precision is
 * the last operation rather than the first.
 */
export function ratio(part: Amount, whole: Amount): number {
  if (whole <= 0n) return 0;
  const scaled = (part * 10_000n) / whole;
  return Math.min(Math.max(Number(scaled) / 10_000, 0), 1);
}
