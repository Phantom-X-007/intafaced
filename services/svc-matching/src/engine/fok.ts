/**
 * FOK through matching. Fill completely or cancel the whole.
 * No partial leftover. The engine does not invent a fill.
 */
import type { TimeInForce } from './types.js';

export const FOK_UNFILLABLE = 'fok_unfillable' as const;

export function fokRests(tif: TimeInForce): boolean {
  return tif !== 'FOK';
}

export function wholeOrNothing(canFillAll: boolean): typeof FOK_UNFILLABLE | null {
  return canFillAll ? null : FOK_UNFILLABLE;
}
