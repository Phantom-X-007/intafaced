/**
 * IOC through matching. Take what is there. Unfilled remainder cancels.
 * The engine does not invent a leftover rest.
 */
import type { TimeInForce } from './types.js';

export const IOC_REMAINDER = 'ioc_remainder' as const;
export const MARKET_REMAINDER = 'market_remainder' as const;

export function iocRests(tif: TimeInForce): boolean {
  return tif !== 'IOC' && tif !== 'FOK';
}

export function remainderReason(price: unknown): typeof IOC_REMAINDER | typeof MARKET_REMAINDER {
  return price == null ? MARKET_REMAINDER : IOC_REMAINDER;
}
