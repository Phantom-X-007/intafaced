import type { EventBus, Subscription } from '@intafaced/events';
import type { HubLogger } from '../depth/hub.js';
import type { DropCopyHub } from './hub.js';

/**
 * Bus → drop-copy hub.
 *
 * Own JetStream durable on the same `fillSettled` facts the private fills
 * channel consumes. Failure of the private orders/fills attach must not
 * unsubscribe this consumer.
 */
export async function subscribeDropCopyFills(input: {
  bus: EventBus;
  hub: DropCopyHub;
  durable: string;
  log?: HubLogger;
}): Promise<Subscription> {
  const { bus, hub, durable, log } = input;

  return bus
    .subscribe(
      'fillSettled',
      (payload) => {
        hub.publishExecution({
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
          engineSequence: payload.sequence,
          ts: payload.ts,
        });
      },
      { durable },
    )
    .then((sub) => {
      log?.info({ durable, subject: 'fillSettled' }, 'ws: drop-copy fills subscribed');
      return sub;
    });
}

export interface DropCopyAttachments {
  readonly fills: Subscription;
}

export async function tryAttachDropCopy(input: {
  bus: EventBus;
  hub: DropCopyHub;
  durable: string;
  log?: HubLogger;
}): Promise<DropCopyAttachments | null> {
  try {
    const fills = await subscribeDropCopyFills(input);
    return { fills };
  } catch (err) {
    input.log?.warn({ err: String(err) }, 'ws: drop-copy bus subscribe failed — will retry independently of the private trading session');
    return null;
  }
}
