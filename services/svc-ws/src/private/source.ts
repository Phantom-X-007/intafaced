import type { EventBus, Subscription } from '@intafaced/events';
import type { HubLogger } from '../depth/hub.js';
import type { PrivateOrderHub } from './hub.js';

/**
 * Bus → private order hub.
 *
 * Consumes `orderUpdated` (svc-trade). Failures are redelivered by JetStream;
 * this handler is pure fan-out.
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
