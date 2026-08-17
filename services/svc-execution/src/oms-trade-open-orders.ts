/**
 * Bridge TradeAdapter.openOrders → OMS open-orders list.
 *
 * Pending rows are dropped — same honesty as fetch/cancel. Does not rewrite
 * status. Empty [] is honest: no acknowledged opens. Optional side narrows
 * buy/sell without inventing the other. Optional type narrows limit/market
 * without inventing the other. Optional clientOrderId narrows the
 * idempotency key without inventing a row. Optional venueOrderId narrows the
 * venue's id without inventing a row. Optional feeAsset narrows the fee
 * currency without inventing a row. Pending still dropped. Null feeAsset
 * stays null and does not match a provided asset.
 */
import type { TradeAdapter, VenueOrder, VenueOrderType } from '@intafaced/venue-contracts';

export type OmsOpenOrdersFn = (
  symbol?: string,
  side?: 'buy' | 'sell',
  type?: VenueOrderType,
  clientOrderId?: string,
  venueOrderId?: string,
  feeAsset?: string,
) => Promise<VenueOrder[]>;

export function tradeAdapterOpenOrders(adapter: TradeAdapter): OmsOpenOrdersFn {
  return async (symbol, side, type, clientOrderId, venueOrderId, feeAsset) => {
    const orders = await adapter.openOrders(symbol);
    return orders.filter(
      (order) =>
        order.status !== 'pending' &&
        (!side || order.side === side) &&
        (!type || order.type === type) &&
        (!clientOrderId || order.clientOrderId === clientOrderId) &&
        (!venueOrderId || order.venueOrderId === venueOrderId) &&
        (!feeAsset || order.feeAsset === feeAsset),
    );
  };
}
