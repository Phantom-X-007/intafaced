/**
 * Initial margin for a futures open (trade.futures F2 helper).
 *
 * Pure arithmetic: notional / leverage, floored to integer scaled units via
 * ledger Amount bigints. Engine and risk still own whether the open is allowed.
 */
import { parseAmount, type Amount } from '@intafaced/ledger-client';

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
