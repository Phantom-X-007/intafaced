/**
 * MM seed mid port (A-TRADE-MM-3).
 *
 * Mids are always **external**:
 *   1. Config map (`TRADE_MM_SEED_MIDS`) — ops-injected prices
 *   2. Optional venue public book mid (when enabled) — fabric snapshot, never invent
 *
 * Null at every layer → seed job skips the market (seed-jobs already refuses empty mid).
 * Never synthesizes a price from thin air.
 */
import { formatAmount } from '@intafaced/ledger-client/money';
import type { MarketDataAdapter } from '@intafaced/venue-contracts';
import { midFromBook } from '../futures/mark-source.js';
import { parseMmSeedMids } from './seed-jobs.js';

export type MmMidSource = (marketId: string) => string | null | Promise<string | null>;

/** Static ops map only. */
export function createConfigMmMidSource(mids: ReadonlyMap<string, string>): MmMidSource {
  return (marketId) => {
    const mid = mids.get(marketId);
    if (mid == null || mid.trim() === '') return null;
    return mid.trim();
  };
}

/**
 * Mid from venue public book (top bid/ask). Missing symbol / empty book / error → null.
 */
export function createVenueMmMidSource(input: {
  adapter: Pick<MarketDataAdapter, 'snapshotBook'>;
  /** marketId → venue unified symbol. Missing → null mid. */
  resolveSymbol: (marketId: string) => string | null;
  depthLimit?: number;
}): MmMidSource {
  const limit = input.depthLimit ?? 5;
  return async (marketId) => {
    const symbol = input.resolveSymbol(marketId);
    if (symbol == null || symbol.trim() === '') return null;
    try {
      const snap = await input.adapter.snapshotBook(symbol, limit);
      const bestBid = snap.bids[0] ? formatAmount(snap.bids[0][0]) : null;
      const bestAsk = snap.asks[0] ? formatAmount(snap.asks[0][0]) : null;
      return midFromBook(bestBid, bestAsk);
    } catch {
      return null;
    }
  };
}

/**
 * First non-null mid wins. All null → null (never invent).
 */
export function chainMmMidSources(...sources: readonly MmMidSource[]): MmMidSource {
  return async (marketId) => {
    for (const src of sources) {
      const mid = await src(marketId);
      if (mid != null && String(mid).trim() !== '') return String(mid).trim();
    }
    return null;
  };
}

/**
 * Build the production mid chain from ops config.
 *
 * - Always: env mid map (may be empty)
 * - Optional: venue mid when `midFromVenue` and adapter present
 */
export function createMmMidSourceFromConfig(input: {
  /** Raw `marketId:mid,...` */
  midsEnv: string;
  midFromVenue: boolean;
  venueAdapter: Pick<MarketDataAdapter, 'snapshotBook'> | null;
  /** marketId → venue symbol when midFromVenue */
  resolveVenueSymbol: (marketId: string) => string | null;
}): MmMidSource {
  const config = createConfigMmMidSource(parseMmSeedMids(input.midsEnv));
  if (!input.midFromVenue || input.venueAdapter == null) {
    return config;
  }
  const venue = createVenueMmMidSource({
    adapter: input.venueAdapter,
    resolveSymbol: input.resolveVenueSymbol,
  });
  return chainMmMidSources(config, venue);
}

// ci: retrigger
