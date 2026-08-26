/**
 * Pegged / relative through matching.
 * Executes at caller-supplied reference + offset (decimal strings → Amount).
 * Missing reference or offset refuses. The engine does not invent a mid.
 * Midpoint stays unsupported — that path would invent a mid.
 */
import { ZERO, add, type Amount } from '@intafaced/ledger-client/money';
import type { EngineOrder } from './types.js';

export const PEG_UNSUPPORTED = 'peg_unsupported' as const;
export const MIDPOINT_UNSUPPORTED = 'midpoint_unsupported' as const;
export const RELATIVE_UNSUPPORTED = 'relative_unsupported' as const;
export const REFERENCE_MISSING = 'missing_reference' as const;
export const OFFSET_MISSING = 'missing_offset' as const;

export type PegRefuse =
  typeof PEG_UNSUPPORTED | typeof MIDPOINT_UNSUPPORTED | typeof RELATIVE_UNSUPPORTED | typeof REFERENCE_MISSING | typeof OFFSET_MISSING;

export function readPeg(order: { readonly peg?: boolean | null }): boolean {
  return order.peg === true;
}

export function readMidpoint(order: { readonly midpoint?: boolean | null }): boolean {
  return order.midpoint === true;
}

export function readRelative(order: { readonly relative?: boolean | null }): boolean {
  return order.relative === true;
}

/** Caller reference. Null/zero/negative is missing — never a book mid or best. */
export function readReference(order: { readonly reference?: Amount | null }): Amount | null {
  if (order.reference === undefined || order.reference === null || order.reference <= ZERO) return null;
  return order.reference;
}

/** Caller offset. Null is missing. Zero and negative are supplied. */
export function readOffset(order: { readonly offset?: Amount | null }): Amount | null {
  if (order.offset === undefined || order.offset === null) return null;
  return order.offset;
}

export function midpointRefuse(midpoint: boolean): { readonly code: typeof MIDPOINT_UNSUPPORTED; readonly message: string } | null {
  if (!midpoint) return null;
  return {
    code: MIDPOINT_UNSUPPORTED,
    message: 'midpoint orders are unsupported; the engine does not invent a mid',
  };
}

export function referenceRefuse(reference: Amount | null): { readonly code: typeof REFERENCE_MISSING; readonly message: string } | null {
  if (reference !== null) return null;
  return {
    code: REFERENCE_MISSING,
    message: 'peg/relative requires a reference; the engine does not invent a mid',
  };
}

export function offsetRefuse(offset: Amount | null): { readonly code: typeof OFFSET_MISSING; readonly message: string } | null {
  if (offset !== null) return null;
  return {
    code: OFFSET_MISSING,
    message: 'peg/relative requires an offset; the engine does not invent a mid',
  };
}

export function pegPrice(reference: Amount, offset: Amount): Amount {
  return add(reference, offset);
}

/** Limit at reference + offset. Not a book mid. */
export function bindPegRelative(order: EngineOrder): EngineOrder {
  if (!readPeg(order) && !readRelative(order)) return order;
  const reference = readReference(order);
  const offset = readOffset(order);
  if (reference === null || offset === null) return order;
  return {
    ...order,
    type: 'limit',
    price: pegPrice(reference, offset),
    stopPrice: null,
  };
}

export function pegIntentRefuse(order: {
  readonly peg?: boolean | null;
  readonly midpoint?: boolean | null;
  readonly relative?: boolean | null;
  readonly reference?: Amount | null;
  readonly offset?: Amount | null;
}): { readonly code: PegRefuse; readonly message: string } | null {
  const midpoint = midpointRefuse(readMidpoint(order));
  if (midpoint) return midpoint;
  if (!readPeg(order) && !readRelative(order)) return null;
  return referenceRefuse(readReference(order)) ?? offsetRefuse(readOffset(order));
}
