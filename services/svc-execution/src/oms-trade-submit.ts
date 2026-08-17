/**
 * Bridge TradeAdapter.placeOrder → LiquiditySource.submit (OMS execute).
 *
 * Does not invent an average on a fill. Does not treat pending as executed.
 * Unknown fees are 0 — never a fabricated venue fee.
 */
import { ZERO, type Amount } from '@intafaced/ledger-client';
import type { TradeAdapter, VenueOrder } from '@intafaced/venue-contracts';
import type { SubmitRequest, VenueExecution } from '@intafaced/venue-adapter';

export type OmsSubmitFn = (request: SubmitRequest) => Promise<VenueExecution>;

function hasFill(filled: Amount): boolean {
  return filled > 0n;
}

function mapStatus(order: VenueOrder): VenueExecution['status'] {
  switch (order.status) {
    case 'filled':
      return 'filled';
    case 'partially_filled':
    case 'open':
      return 'partial';
    case 'rejected':
    case 'canceled':
    case 'expired':
      return 'rejected';
    default:
      throw new Error(`cannot map venue order status ${order.status} to VenueExecution`);
  }
}

export function venueOrderToExecution(order: VenueOrder, request: SubmitRequest): VenueExecution {
  if (order.status === 'pending') {
    throw new Error('venue order is still pending — no VenueExecution until the venue acknowledges');
  }

  const status = mapStatus(order);
  if (!order.venueOrderId) {
    throw new Error('venue order has no venueOrderId — cannot report a VenueExecution');
  }

  if (hasFill(order.filled) && order.averagePrice == null) {
    throw new Error('filled venue order has null averagePrice — refusing to invent a fill price');
  }

  const averagePrice = order.averagePrice ?? request.limitPrice;

  return {
    venueId: order.venueId,
    venueOrderId: order.venueOrderId,
    filledAmount: order.filled,
    averagePrice,
    feeAmount: order.feePaid ?? ZERO,
    feeAsset: order.feeAsset ?? '',
    status,
    executedAt: order.observedAt,
  };
}

export function tradeAdapterSubmit(adapter: TradeAdapter): OmsSubmitFn {
  return async (request) => {
    const order = await adapter.placeOrder({
      symbol: request.symbol,
      side: request.side,
      type: 'limit',
      amount: request.amount,
      price: request.limitPrice,
      clientOrderId: request.clientOrderId,
    });
    return venueOrderToExecution(order, request);
  };
}
