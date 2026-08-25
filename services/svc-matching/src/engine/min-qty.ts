/**
 * Minimum quantity through matching. A fill below the floor does not occur.
 * Missing or zero is not set — the engine does not invent a default.
 */
import { ZERO, type Amount } from '@intafaced/ledger-client/money';

export const MIN_QTY_EXCEEDS = 'min_qty_exceeds_qty' as const;

export type MinQtyRefuse = typeof MIN_QTY_EXCEEDS;

/** Caller min qty. Missing, null, or zero is not set. */
export function readMinQty(order: { readonly minQty?: Amount | null }): Amount | null {
  if (order.minQty === undefined || order.minQty === null || order.minQty <= ZERO) return null;
  return order.minQty;
}

export function minQtyRefuse(qty: Amount, minQty: Amount | null): { readonly code: MinQtyRefuse; readonly message: string } | null {
  if (minQty === null) return null;
  if (minQty > qty) {
    return {
      code: MIN_QTY_EXCEEDS,
      message: 'minQty must not exceed remaining qty; the engine does not invent a fill',
    };
  }
  return null;
}

/** A clip is legal only if it meets the floor and does not leave a stub below the floor. */
export function clipMeetsMinQty(clip: Amount, remainingAfter: Amount, minQty: Amount | null): boolean {
  if (minQty === null || minQty <= ZERO) return clip > ZERO;
  if (clip < minQty) return false;
  if (remainingAfter > ZERO && remainingAfter < minQty) return false;
  return true;
}

export function bothSidesMeetMinQty(
  clip: Amount,
  takerAfter: Amount,
  takerMinQty: Amount | null,
  makerAfter: Amount,
  makerMinQty: Amount | null,
): boolean {
  return clipMeetsMinQty(clip, takerAfter, takerMinQty) && clipMeetsMinQty(clip, makerAfter, makerMinQty);
}
