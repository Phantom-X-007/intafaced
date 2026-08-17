/**
 * Bridge MarketDataAdapter.fundingRate → OMS observation.
 *
 * Method absent is a throw, not a 0 rate — "we never wired funding on this
 * adapter" must not look like "the venue prints 0". Null mark / index pass
 * through. Does not invent a settlement.
 */
import type { FundingRate, MarketDataAdapter } from '@intafaced/venue-contracts';

export type OmsFundingFn = (symbol: string) => Promise<FundingRate>;

export function marketDataAdapterFunding(adapter: MarketDataAdapter): OmsFundingFn {
  return async (symbol) => {
    if (!adapter.fundingRate) {
      throw new Error(`${adapter.venue.id}: fundingRate is not wired on this market-data adapter`);
    }
    return adapter.fundingRate(symbol);
  };
}
