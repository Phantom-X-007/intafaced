import type { AccountAdapter, VenueCredentials } from '@intafaced/venue-contracts';
import { BinanceSpotAccount, type BinanceSpotAccountOptions } from './binance-spot-account.js';
import { BybitSpotAccount, type BybitSpotAccountOptions } from './bybit-spot-account.js';
import { OkxSpotAccount, type OkxSpotAccountOptions } from './okx-spot-account.js';

/**
 * Signed account observation by venue id.
 *
 * Unknown / off id → null. Credentials are passed through, never invented.
 * Withdrawal-capable keys are still refused inside each constructor.
 */
export type VenueAccountAdapterOptions = BinanceSpotAccountOptions & BybitSpotAccountOptions & OkxSpotAccountOptions;

export function createVenueAccountAdapter(
  venueId: string,
  credentials: VenueCredentials | null = null,
  options?: VenueAccountAdapterOptions,
): AccountAdapter | null {
  const id = venueId.trim().toLowerCase();
  if (!id || id === 'off' || id === 'none' || id === 'false') return null;
  if (id === 'binance-spot') return new BinanceSpotAccount(credentials, options);
  if (id === 'bybit-spot') return new BybitSpotAccount(credentials, options);
  if (id === 'okx-spot') return new OkxSpotAccount(credentials, options);
  return null;
}
