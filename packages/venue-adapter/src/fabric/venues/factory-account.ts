import type { AccountAdapter, VenueCredentials } from '@intafaced/venue-contracts';
import { BinanceSpotAccount, type BinanceSpotAccountOptions } from './binance-spot-account.js';

/**
 * Signed account observation by venue id.
 *
 * Unknown / off id → null. Credentials are passed through, never invented.
 * Bybit/OKX stay null on this branch — their signed account files are other PRs.
 * Withdrawal-capable keys are still refused inside the constructor.
 */
export type VenueAccountAdapterOptions = BinanceSpotAccountOptions;

export function createVenueAccountAdapter(
  venueId: string,
  credentials: VenueCredentials | null = null,
  options?: VenueAccountAdapterOptions,
): AccountAdapter | null {
  const id = venueId.trim().toLowerCase();
  if (!id || id === 'off' || id === 'none' || id === 'false') return null;
  if (id === 'binance-spot') return new BinanceSpotAccount(credentials, options);
  return null;
}
