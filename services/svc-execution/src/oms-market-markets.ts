/**
 * Bridge MarketDataAdapter.markets → OMS observation.
 *
 * Empty catalog passes through — "the venue listed nothing" must not look
 * like "we invented BTC/USDT". Venue errors propagate. Does not invent
 * a book or a route. Optional type / quote / base / active / settle / symbol /
 * venueSymbol filter the observation; omitted still returns every instrument,
 * including inactive listings and null-settle spot. Inactive listings stay
 * inactive. Null settle stays null.
 */
import type { MarketDataAdapter, VenueInstrumentType, VenueMarket } from '@intafaced/venue-contracts';

export type OmsMarketsFn = (
  type?: VenueInstrumentType,
  quote?: string,
  base?: string,
  active?: boolean,
  settle?: string,
  symbol?: string,
  venueSymbol?: string,
) => Promise<readonly VenueMarket[]>;

export function marketDataAdapterMarkets(adapter: MarketDataAdapter): OmsMarketsFn {
  return async (type, quote, base, active, settle, symbol, venueSymbol) => {
    const rows = await adapter.markets();
    return rows.filter(
      (row) =>
        (!type || row.type === type) &&
        (!quote || row.quote === quote) &&
        (!base || row.base === base) &&
        (active === undefined || row.active === active) &&
        (!settle || row.settle === settle) &&
        (!symbol || row.symbol === symbol) &&
        (!venueSymbol || row.venueSymbol === venueSymbol),
    );
  };
}
