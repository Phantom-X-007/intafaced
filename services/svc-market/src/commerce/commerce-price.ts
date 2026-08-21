import { formatAmount, parseAmount, MoneyError } from '@intafaced/ledger-client';

/**
 * Numeric from the driver must already be a decimal string.
 * `String(0.1)` is IEEE-rounded — same refuse as indexer `parseAmount(row.price)`.
 */
export function decimalPriceFromDriver(price: unknown): string {
  if (typeof price !== 'string') {
    throw new MoneyError(`Amount must be a decimal string, got ${typeof price}`);
  }
  return formatAmount(parseAmount(price));
}

/** Idempotent claim: a JS number price is not the decimal string, even if String(0.1) === '0.1'. */
export function purchasePriceTermsMatch(rowPrice: unknown, claimedPrice: string): boolean {
  if (typeof rowPrice !== 'string') return false;
  return formatAmount(parseAmount(rowPrice)) === claimedPrice;
}
