/**
 * Bridge TradeAdapter.fetchOrder → OMS fetch (client order id).
 *
 * Pending throws — same honesty as place/cancel. Other statuses pass through.
 */
import type { TradeAdapter, VenueOrder } from '@intafaced/venue-contracts';

export type OmsFetchFn = (symbol: string, clientOrderId: string) => Promise<VenueOrder>;

export function tradeAdapterFetch(adapter: TradeAdapter): OmsFetchFn {
  return async (symbol, clientOrderId) => {
    const order = await adapter.fetchOrder(symbol, clientOrderId);
    if (order.status === 'pending') {
      throw new Error('venue order is still pending — no fetch result until the venue acknowledges');
    }
    return order;
  };
}
