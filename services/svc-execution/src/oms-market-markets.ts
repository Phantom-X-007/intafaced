/**
 * Bridge MarketDataAdapter.markets → OMS observation.
 *
 * Empty catalog passes through — "the venue listed nothing" must not look
 * like "we invented BTC/USDT". Venue errors propagate. Does not invent
 * a book or a route.
 */
import type { MarketDataAdapter, VenueMarket } from '@intafaced/venue-contracts';

export type OmsMarketsFn = () => Promise<readonly VenueMarket[]>;

export function marketDataAdapterMarkets(adapter: MarketDataAdapter): OmsMarketsFn {
  return async () => adapter.markets();
}
