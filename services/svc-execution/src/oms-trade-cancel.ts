/**
 * Bridge TradeAdapter.cancelOrder → OMS cancel (client order id).
 *
 * Does not invent canceled when the venue still reports open/filled/partial.
 * Pending is refused — same honesty as placeOrder → VenueExecution.
 */
import type { TradeAdapter, VenueOrder } from '@intafaced/venue-contracts';

export type OmsCancelFn = (symbol: string, clientOrderId: string) => Promise<VenueOrder>;

export function tradeAdapterCancel(adapter: TradeAdapter): OmsCancelFn {
  return async (symbol, clientOrderId) => {
    const order = await adapter.cancelOrder(symbol, clientOrderId);
    if (order.status === 'pending') {
      throw new Error('venue cancel is still pending — no canceled status until the venue acknowledges');
    }
    return order;
  };
}
