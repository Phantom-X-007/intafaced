/**
 * Bridge MarketDataAdapter.markets → OMS observation.
 *
 * Empty catalog passes through — "the venue listed nothing" must not look
 * like "we invented BTC/USDT". Venue errors propagate. Does not invent
 * a book or a route. Optional type / quote filter the observation; omitted
 * still returns every instrument. Inactive listings stay inactive.
 */
import type { MarketDataAdapter, VenueInstrumentType, VenueMarket } from '@intafaced/venue-contracts';

export type OmsMarketsFn = (type?: VenueInstrumentType, quote?: string) => Promise<readonly VenueMarket[]>;

export function marketDataAdapterMarkets(adapter: MarketDataAdapter): OmsMarketsFn {
  return async (type, quote) => {
    const rows = await adapter.markets();
    return rows.filter((row) => (!type || row.type === type) && (!quote || row.quote === quote));
  };
}
