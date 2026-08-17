/**
 * Bridge TradeAdapter.openOrders → OMS open-orders list.
 *
 * Pending rows are dropped — same honesty as fetch/cancel. Does not rewrite
 * status. Empty [] is honest: no acknowledged opens. Optional side narrows
 * buy/sell without inventing the other.
 */
import type { TradeAdapter, VenueOrder } from '@intafaced/venue-contracts';

export type OmsOpenOrdersFn = (symbol?: string, side?: 'buy' | 'sell') => Promise<VenueOrder[]>;

export function tradeAdapterOpenOrders(adapter: TradeAdapter): OmsOpenOrdersFn {
  return async (symbol, side) => {
    const orders = await adapter.openOrders(symbol);
    return orders.filter((order) => order.status !== 'pending' && (!side || order.side === side));
  };
}
