/**
 * Bridge MarketDataAdapter.markets → OMS observation.
 *
 * Empty catalog passes through — "the venue listed nothing" must not look
 * like "we invented BTC/USDT". Venue errors propagate. Does not invent
 * a book or a route. Optional type filters the observation; omitted still
 * returns every instrument type. Inactive listings stay inactive.
 */
import type { MarketDataAdapter, VenueInstrumentType, VenueMarket } from '@intafaced/venue-contracts';

export type OmsMarketsFn = (type?: VenueInstrumentType) => Promise<readonly VenueMarket[]>;

export function marketDataAdapterMarkets(adapter: MarketDataAdapter): OmsMarketsFn {
  return async (type) => {
    const rows = await adapter.markets();
    return type ? rows.filter((row) => row.type === type) : rows;
  };
}
