import type { EventBus, Subscription } from '@intafaced/events';
import type { HubLogger } from '../depth/hub.js';
import type { PrivateOrderHub } from './hub.js';

/**
 * Bus → private hub.
 *
 * Consumes trade-owned private signals. Failures are redelivered by JetStream;
 * these handlers are pure fan-out (no money path).
 */
export async function subscribePrivateOrders(input: {
  bus: EventBus;
  hub: PrivateOrderHub;
  durable: string;
  log?: HubLogger;
}): Promise<Subscription> {
  const { bus, hub, durable, log } = input;

  return bus
    .subscribe(
      'orderUpdated',
      (payload) => {
        hub.publish({
          orderId: payload.orderId,
          userId: payload.userId,
          marketId: payload.marketId,
          status: payload.status,
          side: payload.side,
          type: payload.type,
          qty: payload.qty,
          filledQty: payload.filledQty,
          price: payload.price,
          clientOrderId: payload.clientOrderId,
          ts: payload.ts,
        });
      },
      { durable },
    )
    .then((sub) => {
      log?.info({ durable, subject: 'orderUpdated' }, 'ws: private orders subscribed');
      return sub;
    });
}

export async function subscribePrivateFills(input: {
  bus: EventBus;
  hub: PrivateOrderHub;
  durable: string;
  log?: HubLogger;
}): Promise<Subscription> {
  const { bus, hub, durable, log } = input;

  return bus
    .subscribe(
      'fillSettled',
      (payload) => {
        hub.publishFill({
          fillId: payload.fillId,
          orderId: payload.orderId,
          userId: payload.userId,
          marketId: payload.marketId,
          side: payload.side,
          liquidity: payload.liquidity,
          price: payload.price,
          qty: payload.qty,
          quoteAmount: payload.quoteAmount,
          feeAsset: payload.feeAsset,
          feeAmount: payload.feeAmount,
          feeBps: payload.feeBps,
          sequence: payload.sequence,
          ts: payload.ts,
        });
      },
      { durable },
    )
    .then((sub) => {
      log?.info({ durable, subject: 'fillSettled' }, 'ws: private fills subscribed');
      return sub;
    });
}

export async function subscribePrivatePositions(input: {
  bus: EventBus;
  hub: PrivateOrderHub;
  durable: string;
  log?: HubLogger;
}): Promise<Subscription> {
  const { bus, hub, durable, log } = input;

  return bus
    .subscribe(
      'positionUpdated',
      (payload) => {
        hub.publishPosition({
          positionId: payload.positionId,
          userId: payload.userId,
          marketId: payload.marketId,
          symbol: payload.symbol,
          status: payload.status,
          side: payload.side,
          contracts: payload.contracts,
          entryPrice: payload.entryPrice,
          markPrice: payload.markPrice,
          notional: payload.notional,
          leverage: payload.leverage,
          collateral: payload.collateral,
          unrealizedPnl: payload.unrealizedPnl,
          realizedPnl: payload.realizedPnl,
          liquidationPrice: payload.liquidationPrice,
          marginMode: payload.marginMode,
          fundingPaid: payload.fundingPaid,
          ts: payload.ts,
        });
      },
      { durable },
    )
    .then((sub) => {
      log?.info({ durable, subject: 'positionUpdated' }, 'ws: private positions subscribed');
      return sub;
    });
}
