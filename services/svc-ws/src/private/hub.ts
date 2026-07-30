import { CLOSE_TRY_LATER, type DepthSink, type HubLogger } from '../depth/hub.js';

/**
 * PRIVATE ORDER FAN-OUT.
 *
 * Fans `orderUpdated` frames to sockets authenticated as that user only.
 * This hub never places orders and never holds balances — it is a mirror of
 * trade-owned lifecycle events for clients that already know the user.
 */

export type PrivateSink = DepthSink;

export interface PrivateOrderUpdate {
  readonly orderId: string;
  readonly userId: string;
  readonly marketId: string;
  readonly status: string;
  readonly side: string;
  readonly type: string;
  readonly qty: string;
  readonly filledQty: string;
  readonly price: string | null;
  readonly clientOrderId: string | null;
  readonly ts: string;
}

export interface PrivateFillUpdate {
  readonly fillId: string;
  readonly orderId: string;
  readonly userId: string;
  readonly marketId: string;
  readonly side: string;
  readonly liquidity: string;
  readonly price: string;
  readonly qty: string;
  readonly quoteAmount: string;
  readonly feeAsset: string;
  readonly feeAmount: string;
  readonly feeBps: number;
  readonly sequence: number;
  readonly ts: string;
}

export interface PrivateOrderHubOptions {
  readonly highWaterBytes: number;
  readonly maxLagTicks: number;
  readonly maxConnections: number;
}

interface Subscription {
  readonly userId: string;
  readonly sink: PrivateSink;
  lagTicks: number;
  closed: boolean;
}

const NO_LOG: HubLogger = { info: () => undefined, warn: () => undefined };

export class PrivateOrderHub {
  readonly #options: PrivateOrderHubOptions;
  readonly #log: HubLogger;
  readonly #subscriptions = new Set<Subscription>();
  #droppedFrames = 0;
  #evictions = 0;
  #updates = 0;

  constructor(options: PrivateOrderHubOptions, log: HubLogger = NO_LOG) {
    this.#options = options;
    this.#log = log;
  }

  get connections(): number {
    return this.#subscriptions.size;
  }

  get stats(): { connections: number; updates: number; droppedFrames: number; evictions: number } {
    return {
      connections: this.#subscriptions.size,
      updates: this.#updates,
      droppedFrames: this.#droppedFrames,
      evictions: this.#evictions,
    };
  }

  attach(userId: string, sink: PrivateSink): () => void {
    if (this.#subscriptions.size >= this.#options.maxConnections) {
      sink.close(CLOSE_TRY_LATER, 'private gateway at capacity');
      return () => undefined;
    }

    const sub: Subscription = { userId, sink, lagTicks: 0, closed: false };
    this.#subscriptions.add(sub);
    return () => {
      sub.closed = true;
      this.#subscriptions.delete(sub);
    };
  }

  publish(update: PrivateOrderUpdate): void {
    this.#fanout(update.userId, JSON.stringify({ channel: 'orders', ...update }));
  }

  publishFill(update: PrivateFillUpdate): void {
    this.#fanout(update.userId, JSON.stringify({ channel: 'fills', ...update }));
  }

  #fanout(userId: string, frame: string): void {
    this.#updates++;

    for (const sub of this.#subscriptions) {
      if (sub.closed || sub.userId !== userId) continue;

      if (sub.sink.bufferedBytes > this.#options.highWaterBytes) {
        sub.lagTicks++;
        this.#droppedFrames++;
        if (sub.lagTicks >= this.#options.maxLagTicks) {
          this.#evictions++;
          sub.closed = true;
          this.#subscriptions.delete(sub);
          sub.sink.close(1008, 'client too slow');
          this.#log.warn({ userId: sub.userId }, 'ws-private: evicted lagging client');
        }
        continue;
      }

      sub.lagTicks = 0;
      try {
        sub.sink.send(frame);
      } catch {
        sub.closed = true;
        this.#subscriptions.delete(sub);
      }
    }
  }

  async close(reason: string): Promise<void> {
    for (const sub of [...this.#subscriptions]) {
      sub.closed = true;
      try {
        sub.sink.close(1001, reason);
      } catch {
        /* ignore */
      }
    }
    this.#subscriptions.clear();
  }
}
