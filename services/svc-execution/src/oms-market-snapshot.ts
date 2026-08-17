/**
 * Bridge MarketDataAdapter.snapshotBook → OMS observation.
 *
 * Empty bids/asks and `sequenced: false` / `sequence: -1` pass through —
 * "the venue has no book" must not look like a mid at 0. Venue errors
 * propagate. Does not invent a mark.
 */
import type { MarketDataAdapter, VenueBookSnapshot } from '@intafaced/venue-contracts';

export type OmsSnapshotFn = (symbol: string, limit?: number) => Promise<VenueBookSnapshot>;

export function marketDataAdapterSnapshot(adapter: MarketDataAdapter): OmsSnapshotFn {
  return async (symbol, limit) => adapter.snapshotBook(symbol, limit);
}
