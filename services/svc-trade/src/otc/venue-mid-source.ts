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
import { midFromVenueBook, parseVenueMarkSymbols, readObservedAt } from '../futures/mark-from-venue.js';
import { createConfigOtcMidSource, type OtcMidSource, type OtcQuotedMid } from './mid-source.js';

export function createVenueOtcMidSource(input: {
  adapter: Pick<MarketDataAdapter, 'snapshotBook'>;
  /** OTC pairKey (BTC/USDT) → venue unified symbol. Missing → null. */
  resolveSymbol: (pairKey: string) => string | null;
  depthLimit?: number;
}): OtcMidSource {
  const limit = input.depthLimit ?? 5;
  const requirement = depthRequirement(null);
  return async (pairKey): Promise<OtcQuotedMid | null> => {
    const symbol = input.resolveSymbol(pairKey);
    if (symbol == null || symbol.trim() === '') return null;
    try {
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
}): { source: OtcMidSource; liveObservationFeed: boolean } {
  const config = createConfigOtcMidSource(input.midsEnv);
  if (!input.midFromVenue || input.venueAdapter == null) {
    return { source: config, liveObservationFeed: false };
  }
  const map = parseVenueMarkSymbols(input.venueSymbols);
  const venue = createVenueOtcMidSource({
    adapter: input.venueAdapter,
    resolveSymbol: (pairKey) => map.get(pairKey) ?? null,
  });
  return { source: venue, liveObservationFeed: true };
}
