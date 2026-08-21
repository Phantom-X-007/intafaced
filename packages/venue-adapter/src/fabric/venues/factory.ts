import type { Amount } from '@intafaced/ledger-client/money';
import { midFromSnapshot, parseUnifiedSymbol, type MarketDataAdapter, type VenueBookSnapshot } from '@intafaced/venue-contracts';
import { BinanceSpotMarketData } from './binance-spot.js';
import { BybitSpotMarketData } from './bybit-spot.js';
import { OkxSpotMarketData } from './okx-spot.js';

/**
 * PUBLIC MARKET-DATA VENUE IDS — the factory that makes an adapter a venue.
 *
 * An adapter written and unregistered is a file, not a venue. `cross-check.ts`
 * needs three fresh mids before a median can say which book is wrong; with two
 * venues the check is `inconclusive` by construction. This list is that third
 * id, plus the two already on tip.
 *
 * Trading / account halves stay unbuilt. No credentials are accepted here.
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
