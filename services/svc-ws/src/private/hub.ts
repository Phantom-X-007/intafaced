import { CLOSE_TRY_LATER, type DepthSink, type HubLogger } from '../depth/hub.js';

/**
 * PRIVATE ORDER / FILL / POSITION FAN-OUT.
 *
 * Fans trade-owned lifecycle frames to sockets authenticated as that user only.
 * This hub never places orders, never opens positions, and never holds balances —
 * it is a mirror of events for clients that already know the user.
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

export interface PrivatePositionUpdate {
  readonly positionId: string;
  readonly userId: string;
  readonly marketId: string;
  readonly symbol: string;
  /** Includes `closing` — voluntary exit waiting on a mark (ADR 2026-08-07). */
  readonly status: 'open' | 'closing' | 'closed' | 'liquidated';
  readonly side: 'long' | 'short';
  readonly contracts: string;
  readonly entryPrice: string;
  readonly markPrice: string | null;
  readonly notional: string;
  readonly leverage: string | null;
  readonly collateral: string | null;
  readonly unrealizedPnl: string | null;
  readonly realizedPnl: string | null;
  readonly liquidationPrice: string | null;
  readonly marginMode: 'cross' | 'isolated' | null;
  readonly fundingPaid: string;
  readonly closingReason?: string | null;
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

  /**
   * Register a sink for `userId`. Returns a detach function, or `null` when the
   * hub is at capacity (sink is closed with 1013 before return). Callers must
   * not send ready frames after a null — that would claim a subscription the
   * hub never held.
   */
  attach(userId: string, sink: PrivateSink): (() => void) | null {
    if (this.#subscriptions.size >= this.#options.maxConnections) {
      sink.close(CLOSE_TRY_LATER, 'private gateway at capacity');
      return null;
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

  publishPosition(update: PrivatePositionUpdate): void {
    this.#fanout(update.userId, JSON.stringify({ channel: 'positions', ...update }));
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
