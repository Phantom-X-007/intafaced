/**
 * Post-only rest. Matching owns the book.
 * Refuse if the order would take. The engine does not invent a price.
 */
import type { TimeInForce } from './types.js';

export function bindPostOnlyTif(tif: TimeInForce, postOnly?: boolean): TimeInForce {
  if (postOnly !== true) return tif;
  if (tif === 'IOC' || tif === 'FOK') return tif;
  return 'PO';
}

export function postOnlyCannotRest(tif: TimeInForce, postOnly?: boolean): boolean {
  return postOnly === true && (tif === 'IOC' || tif === 'FOK');
}

export function inheritRestingTif(cmdTif: TimeInForce | undefined, postOnly: boolean): TimeInForce {
  if (cmdTif !== undefined) return cmdTif;
  return postOnly ? 'PO' : 'GTC';
}
