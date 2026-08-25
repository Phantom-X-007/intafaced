/**
 * Pegged / relative / midpoint through matching.
 * Unsupported intent refuses rather than becoming a limit.
 * Missing or false is a normal order. The engine does not invent a mid.
 */

export const PEG_UNSUPPORTED = 'peg_unsupported' as const;
export const MIDPOINT_UNSUPPORTED = 'midpoint_unsupported' as const;
export const RELATIVE_UNSUPPORTED = 'relative_unsupported' as const;

export type PegRefuse = typeof PEG_UNSUPPORTED | typeof MIDPOINT_UNSUPPORTED | typeof RELATIVE_UNSUPPORTED;

export function readPeg(order: { readonly peg?: boolean | null }): boolean {
  return order.peg === true;
}

export function readMidpoint(order: { readonly midpoint?: boolean | null }): boolean {
  return order.midpoint === true;
}

export function readRelative(order: { readonly relative?: boolean | null }): boolean {
  return order.relative === true;
}

export function pegRefuse(peg: boolean): { readonly code: typeof PEG_UNSUPPORTED; readonly message: string } | null {
  if (!peg) return null;
  return {
    code: PEG_UNSUPPORTED,
    message: 'pegged orders are unsupported; the engine does not invent a reference price',
  };
}

export function midpointRefuse(midpoint: boolean): { readonly code: typeof MIDPOINT_UNSUPPORTED; readonly message: string } | null {
  if (!midpoint) return null;
  return {
    code: MIDPOINT_UNSUPPORTED,
    message: 'midpoint orders are unsupported; the engine does not invent a mid',
  };
}

export function relativeRefuse(relative: boolean): { readonly code: typeof RELATIVE_UNSUPPORTED; readonly message: string } | null {
  if (!relative) return null;
  return {
    code: RELATIVE_UNSUPPORTED,
    message: 'relative orders are unsupported; the engine does not invent a reference price',
  };
}

export function pegIntentRefuse(order: {
  readonly peg?: boolean | null;
  readonly midpoint?: boolean | null;
  readonly relative?: boolean | null;
}): { readonly code: PegRefuse; readonly message: string } | null {
  return pegRefuse(readPeg(order)) ?? midpointRefuse(readMidpoint(order)) ?? relativeRefuse(readRelative(order));
}
