import type { Amount } from '@intafaced/ledger-client/money';
import {
  midFromSnapshot,
  parseUnifiedSymbol,
  type AccountAdapter,
  type MarketDataAdapter,
  type VenueBookSnapshot,
  type VenueCredentials,
} from '@intafaced/venue-contracts';
import { BinanceSpotAccount, type BinanceSpotAccountOptions } from './binance-spot-account.js';
import { BinanceSpotMarketData, BinanceSpotTrade } from './binance-spot.js';
import { BybitSpotAccount, type BybitSpotAccountOptions } from './bybit-spot-account.js';
import { BybitSpotMarketData, BybitSpotTrade } from './bybit-spot.js';
import { OkxSpotAccount, type OkxSpotAccountOptions } from './okx-spot-account.js';
import { OkxSpotMarketData, OkxSpotTrade, type OkxSpotTradeOptions } from './okx-spot.js';

/**
 * PUBLIC MARKET-DATA VENUE IDS — the factory that makes an adapter a venue.
 *
 * An adapter written and unregistered is a file, not a venue. `cross-check.ts`
 * needs three fresh mids before a median can say which book is wrong; with two
 * venues the check is `inconclusive` by construction. This list is that third
 * id, plus the two already on tip.
 *
 * Public market-data factory invents no credentials. Signed trade is
 * `createVenueTradeAdapter` (keys passed in, never invented).
 *
 * svc-trade still has a local copy of this factory (mark-from-venue.ts) that
 * only knows binance-spot / bybit-spot. That file is under an open trade PR
 * and is not dual-edited here. Operators who import THIS function get three
 * public venues; TRADE_VENUE_MARK_VENUE=okx-spot stays null on the trade
 * mount until that copy re-exports.
 */
export const PUBLIC_MARKET_DATA_VENUE_IDS = ['binance-spot', 'bybit-spot', 'okx-spot'] as const;
export type PublicMarketDataVenueId = (typeof PUBLIC_MARKET_DATA_VENUE_IDS)[number];

/**
 * Transport and clock injection accepted by every adapter this factory can build.
 *
 * An INTERSECTION rather than one venue's options: all three are constructed
 * through the same `HttpPort`/`StreamPort` seam.
 */
export type VenueMarketDataOptions = ConstructorParameters<typeof BinanceSpotMarketData>[0] &
  ConstructorParameters<typeof BybitSpotMarketData>[0] &
  ConstructorParameters<typeof OkxSpotMarketData>[0];

/**
 * Supported venue ids for public market data.
 * Unknown id → null (refuse invent of an adapter).
 * Empty / off / none / false → null (feature off).
 */
export function createVenueMarketDataAdapter(venueId: string, options?: VenueMarketDataOptions): MarketDataAdapter | null {
  const id = venueId.trim().toLowerCase();
  if (!id || id === 'off' || id === 'none' || id === 'false') return null;
  if (id === 'binance-spot') return new BinanceSpotMarketData(options);
  if (id === 'bybit-spot') return new BybitSpotMarketData(options);
  if (id === 'okx-spot') return new OkxSpotMarketData(options);
  return null;
}

export type VenueTradeAdapter = BinanceSpotTrade | BybitSpotTrade | OkxSpotTrade;
export type VenueTradeAdapterOptions = OkxSpotTradeOptions;

/**
 * Signed spot trade adapters by venue id.
 * Unknown / off id → null. Credentials are passed through, never invented.
 * Withdrawal-capable keys are still refused inside each constructor.
 */
export function createVenueTradeAdapter(
  venueId: string,
  credentials: VenueCredentials | null = null,
  options?: VenueTradeAdapterOptions,
): VenueTradeAdapter | null {
  const id = venueId.trim().toLowerCase();
  if (!id || id === 'off' || id === 'none' || id === 'false') return null;
  if (id === 'binance-spot') return new BinanceSpotTrade(credentials);
  if (id === 'bybit-spot') return new BybitSpotTrade(credentials);
  if (id === 'okx-spot') return new OkxSpotTrade(credentials, options);
  return null;
}

export type VenueAccountAdapter = BinanceSpotAccount | BybitSpotAccount | OkxSpotAccount;
export type VenueAccountAdapterOptions = BinanceSpotAccountOptions & BybitSpotAccountOptions & OkxSpotAccountOptions;

/**
 * Signed account observation by venue id.
 *
 * Unknown / off id → null. Credentials are passed through, never invented.
 * Withdrawal-capable keys are still refused inside each constructor.
 */
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

/**
 * Mid from a public venue book — or `null`.
 *
 * Dark / off / unknown venue id, unmapped (non-unified) market spelling, a
 * missing snapshot, a snapshot stamped for a different venue or symbol, and
 * an empty or one-sided book all return `null`. A thick book on an unknown
 * or dark id still cannot become a number: the factory refuse is first.
 *
 * Does not add a venue. Does not touch the trading half.
 */
export function publicVenueBookMid(venueId: string, symbol: string, snapshot: VenueBookSnapshot | null | undefined): Amount | null {
  if (createVenueMarketDataAdapter(venueId) === null) return null;
  if (parseUnifiedSymbol(symbol) === null) return null;
  if (!snapshot) return null;
  const id = venueId.trim().toLowerCase();
  if (snapshot.venueId !== id || snapshot.symbol !== symbol) return null;
  return midFromSnapshot(snapshot);
}
