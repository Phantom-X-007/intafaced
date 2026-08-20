/**
 * Bridge MarketDataAdapter.borrowRate → OMS observation.
 *
 * Method absent is a throw, not a 0 rate — "we never wired borrow on this
 * adapter" must not look like "the venue prints 0". Null available passes
 * through. Does not invent a loan.
 */
import type { BorrowRate, MarketDataAdapter } from '@intafaced/venue-contracts';

export type OmsBorrowFn = (asset: string) => Promise<BorrowRate>;

export function marketDataAdapterBorrow(adapter: MarketDataAdapter): OmsBorrowFn {
  return async (asset) => {
    if (!adapter.borrowRate) {
      throw new Error(`${adapter.venue.id}: borrowRate is not wired on this market-data adapter`);
    }
    return adapter.borrowRate(asset);
  };
}
