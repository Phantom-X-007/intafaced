import type { EventBus, Subscription } from '@intafaced/events';
import type { HubLogger } from '../depth/hub.js';
import type { TradeHub } from './hub.js';

/**
 * WHERE TRADES COME FROM.
 *
 * `orderFilled` is already on the bus (`packages/events` catalog). svc-trade
 * consumes it to settle; this consumer only turns it into a public print and
 * hands it to the hub. No money path, no principal, no new subject.
 *
 * Durable name must be unique per replica if more than one svc-ws instance
 * should each receive every fill (JetStream durables are exclusive). Default
 * is stable for single-replica dev; set `WS_TRADES_DURABLE` in multi-replica.
 */
export interface TradeSourceOptions {
  readonly bus: EventBus;
  readonly hub: TradeHub;
  readonly durable: string;
  readonly log?: HubLogger;
}

export async function subscribeTradeTape(options: TradeSourceOptions): Promise<Subscription> {
  const { bus, hub, durable, log } = options;

  return bus
    .subscribe(
      'orderFilled',
      (payload) => {
        // Synchronous ingest: the hub is pure CPU and must not hold the JetStream
        // ack. A throw here would nak and redeliver; ingest already swallows
        // shape errors and dedupes by sequence.
        hub.ingest(payload);
      },
      { durable },
    )
    .then((sub) => {
      log?.info({ durable, subject: 'orderFilled' }, 'ws: trade tape subscribed');
      return sub;
    });
}
