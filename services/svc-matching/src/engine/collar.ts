/**
 * Price collar through matching.
 * Caller supplies min/max decimal strings (as Amount). Submit outside the band refuses.
 * Missing band when collar is requested refuses. The engine does not invent last or mid.
 */
import { ZERO, type Amount } from '@intafaced/ledger-client/money';

export const COLLAR_MISSING = 'missing_collar' as const;
export const COLLAR_OUTSIDE = 'outside_collar' as const;

export type CollarRefuse = typeof COLLAR_MISSING | typeof COLLAR_OUTSIDE;

export function readCollar(order: { readonly collar?: boolean | null }): boolean {
  return order.collar === true;
}

/** Caller min. Null/zero/negative is missing — never last or mid. */
export function readMin(order: { readonly min?: Amount | null }): Amount | null {
  if (order.min === undefined || order.min === null || order.min <= ZERO) return null;
  return order.min;
}

/** Caller max. Null/zero/negative is missing — never last or mid. */
export function readMax(order: { readonly max?: Amount | null }): Amount | null {
  if (order.max === undefined || order.max === null || order.max <= ZERO) return null;
  return order.max;
}

export function missingCollarRefuse(
  min: Amount | null,
  max: Amount | null,
): { readonly code: typeof COLLAR_MISSING; readonly message: string } | null {
  if (min !== null && max !== null) return null;
  return {
    code: COLLAR_MISSING,
    message: 'collar requires caller min and max; the engine does not invent last or mid',
  };
}

export function outsideCollarRefuse(
  price: Amount | null,
  min: Amount,
  max: Amount,
): { readonly code: typeof COLLAR_OUTSIDE; readonly message: string } | null {
  if (price === null || price < min || price > max) {
    return {
      code: COLLAR_OUTSIDE,
      message: 'submit price is outside the caller collar; the engine does not invent last or mid',
    };
  }
  return null;
}

export function collarIntentRefuse(order: {
  readonly collar?: boolean | null;
  readonly min?: Amount | null;
  readonly max?: Amount | null;
  readonly price?: Amount | null;
}): { readonly code: CollarRefuse; readonly message: string } | null {
  if (!readCollar(order)) return null;
  const min = readMin(order);
  const max = readMax(order);
  if (min === null || max === null) return missingCollarRefuse(min, max);
  return outsideCollarRefuse(order.price ?? null, min, max);
}
