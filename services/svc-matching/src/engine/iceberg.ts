/**
 * Iceberg through matching. Only the display qty is visible.
 * Hidden remainder refills as display takes.
 * The engine does not invent a display.
 */
import { ZERO, min, type Amount } from '@intafaced/ledger-client/money';

export const ICEBERG_DISPLAY_MISSING = 'iceberg_display_missing' as const;
export const ICEBERG_DISPLAY_NOT_SMALLER = 'iceberg_display_not_smaller' as const;

export type IcebergRefuse = typeof ICEBERG_DISPLAY_MISSING | typeof ICEBERG_DISPLAY_NOT_SMALLER;

export function icebergDisplayRefuse(
  qty: Amount,
  displayQty: Amount | null,
): { readonly code: IcebergRefuse; readonly message: string } | null {
  if (displayQty === null || displayQty <= ZERO) {
    return {
      code: ICEBERG_DISPLAY_MISSING,
      message: 'iceberg requires a display qty; the engine does not invent a display',
    };
  }
  if (displayQty >= qty) {
    return {
      code: ICEBERG_DISPLAY_NOT_SMALLER,
      message: 'iceberg display must be smaller than total; the engine does not invent a display',
    };
  }
  return null;
}

/** Public book qty. Hidden remainder is not visible. */
export function visibleRemaining(remaining: Amount, displayRemaining: Amount | null): Amount {
  if (displayRemaining === null) return remaining;
  return min(displayRemaining, remaining);
}

/** After display is taken, refill from hidden — never more than peak or leftover. */
export function refillDisplay(peak: Amount, remaining: Amount): Amount {
  return min(peak, remaining);
}

export function hiddenRemaining(remaining: Amount, displayRemaining: Amount | null): Amount {
  if (displayRemaining === null) return ZERO;
  return remaining > displayRemaining ? remaining - displayRemaining : ZERO;
}

export function wantsIceberg(order: { readonly iceberg?: boolean; readonly displayQty?: Amount | null }): boolean {
  return order.iceberg === true || order.displayQty !== undefined;
}
