/**
 * OTC mid from §27 venue fabric public book — SOCKET §13 `socket.otc-mid-feed`.
 *
 * Chains in FRONT of the boot TRADE_OTC_MIDS map without importing `mm/mid-source.ts`
 * (that module pulls venue-contracts + futures mark graph into MM seed; this desk
 * only needs snapshotBook + asOf).
 *
 * Never invents:
 *   · flag off / no adapter → boot map (age-gated memory, not this socket)
 *   · unmapped pair / empty / one-sided / thin book / missing observedAt / venue error → null
 *   · when the venue source is installed, boot map is NOT a fallback (stale memory would
 *     fill a dark book)
 *
 * asOf is the venue snapshot's observedAt — never the read clock.
 */

import type { MarketDataAdapter } from '@intafaced/venue-contracts';
import { depthRequirement } from '../futures/mark-from-depth.js';
import { midFromVenueBook, parseVenueMarkSymbols, readObservedAt, type MaintainedVenueBookPort } from '../futures/mark-from-venue.js';
import { createConfigOtcMidSource, type OtcMidSource, type OtcQuotedMid } from './mid-source.js';

export function createVenueOtcMidSource(input: {
  adapter: Pick<MarketDataAdapter, 'snapshotBook'>;
  /** OTC pairKey (BTC/USDT) → venue unified symbol. Missing → null. */
  resolveSymbol: (pairKey: string) => string | null;
  /**
   * When set, mids come from the sequenced MaintainedBook (same port as
   * futures marks / MM seed). Unset keeps snapshotBook poll. Desynced /
   * missing observedAt → null. Desk-law maxMidAgeSeconds still ages asOf;
   * this path does not invent a second staleness bar.
   */
  bookForSymbol?: (symbol: string) => MaintainedVenueBookPort | null;
  depthLimit?: number;
}): OtcMidSource {
  const limit = input.depthLimit ?? 5;
  const requirement = depthRequirement(null);
  return async (pairKey): Promise<OtcQuotedMid | null> => {
    const symbol = input.resolveSymbol(pairKey);
    if (symbol == null || symbol.trim() === '') return null;
    try {
      if (input.bookForSymbol) {
        const book = input.bookForSymbol(symbol);
        if (book == null || !book.servable) return null;
        const observedAt = book.observedAt();
        if (observedAt == null) return null;
        const top = book.top();
        if (top == null) return null;
        const mid = midFromVenueBook(
          {
            bids: top.bestBid != null && top.bestBidQty != null ? [[top.bestBid, top.bestBidQty]] : [],
            asks: top.bestAsk != null && top.bestAskQty != null ? [[top.bestAsk, top.bestAskQty]] : [],
          },
          requirement,
        );
        if (mid == null || String(mid).trim() === '') return null;
        return { mid, asOf: observedAt };
      }

      const snap = await input.adapter.snapshotBook(symbol, limit);
      const observedAt = readObservedAt(snap);
      if (observedAt == null) return null;
      const mid = midFromVenueBook(snap, requirement);
      if (mid == null || String(mid).trim() === '') return null;
      return { mid, asOf: observedAt };
    } catch {
      return null;
    }
  };
}

/**
 * Production chain from ops config.
 *
 * Venue observation is opt-in (`TRADE_OTC_MID_FROM_VENUE`) and uses the same
 * public adapter as futures/MM marks. Empty symbol map never invents pairs.
 */
export function createOtcMidSourceFromConfig(input: {
  midsEnv: string;
  midFromVenue: boolean;
  venueAdapter: Pick<MarketDataAdapter, 'snapshotBook'> | null;
  /** Raw `BTC/USDT:BTC/USDT,...` — pairKey → venue symbol. */
  venueSymbols: string;
  bookForSymbol?: (symbol: string) => MaintainedVenueBookPort | null;
}): { source: OtcMidSource; liveObservationFeed: boolean } {
  const config = createConfigOtcMidSource(input.midsEnv);
  if (!input.midFromVenue || input.venueAdapter == null) {
    return { source: config, liveObservationFeed: false };
  }
  const map = parseVenueMarkSymbols(input.venueSymbols);
  const venue = createVenueOtcMidSource({
    adapter: input.venueAdapter,
    resolveSymbol: (pairKey) => map.get(pairKey) ?? null,
    ...(input.bookForSymbol ? { bookForSymbol: input.bookForSymbol } : {}),
  });
  return { source: venue, liveObservationFeed: true };
}
