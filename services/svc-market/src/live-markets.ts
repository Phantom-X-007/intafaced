/**
 * Q-market leftover: listing which assets is owner SOCKET (P0-06).
 * A door that lists live markets without an owner pin is a lie.
 * Presence-only pin — never parsed as a coin/market list. Do not invent the set.
 */
import { MarketError } from './vendor-service.js';

export const MARKET_LISTING_PIN_ENV = 'MARKET_LISTING_PIN' as const;

export const MARKET_LISTING_PIN_UNSET = 'market.listing_pin_unset' as const;
export const MARKET_LISTING_PIN_IEEE = 'market.listing_pin_ieee' as const;
export const MARKET_LISTING_SET_UNSET = 'market.listing_set_unset' as const;

export const MARKET_LISTING_PIN_UNSET_MESSAGE = 'MARKET_LISTING_PIN is unset — empty catalogue; listing which assets is owner SOCKET';
export const MARKET_LISTING_PIN_IEEE_MESSAGE = 'MARKET_LISTING_PIN must be an owner pin string — IEEE number refused on the wire';
export const MARKET_LISTING_SET_UNSET_MESSAGE = 'owner listing pin is not a live-market set — empty catalogue; do not invent listed assets';

function present(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  if (typeof raw === 'string' && raw.trim() === '') return false;
  return true;
}

export function readOwnerListingPin(env: NodeJS.ProcessEnv = process.env): unknown {
  return env[MARKET_LISTING_PIN_ENV];
}

/**
 * Public live-market catalogue. Never returns a market id.
 * Unpinned / IEEE refuse by name. Pin present still refuses the set (SOCKET).
 */
export function listLiveMarkets(env: NodeJS.ProcessEnv = process.env): never {
  const pin = readOwnerListingPin(env);
  if (typeof pin === 'number') {
    throw new MarketError(MARKET_LISTING_PIN_IEEE_MESSAGE, MARKET_LISTING_PIN_IEEE);
  }
  if (!present(pin) || typeof pin !== 'string') {
    throw new MarketError(MARKET_LISTING_PIN_UNSET_MESSAGE, MARKET_LISTING_PIN_UNSET);
  }
  throw new MarketError(MARKET_LISTING_SET_UNSET_MESSAGE, MARKET_LISTING_SET_UNSET);
}
