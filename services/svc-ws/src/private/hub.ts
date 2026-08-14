import { CLOSE_TRY_LATER, type DepthSink, type HubLogger } from '../depth/hub.js';

/**
 * PRIVATE ORDER / FILL / POSITION FAN-OUT.
 *
 * Fans trade-owned lifecycle frames to sockets authenticated as that user only.
 * This hub never places orders, never opens positions, and never holds balances —
 * it is a mirror of events for clients that already know the user.
 *
 * ── Empty ≠ zero ────────────────────────────────────────────────────────────
 *
 * An unseeded blotter, a matching 404, or a seed failure is **absence**.
 * Emitting `{ orders: [] }` / `{ positions: [] }` (or a JSON `[]`) would let a
 * client treat that as a live zero book of nothing. Listed seats stay
 * subscribed with no blotter frames until a real order or position exists.
 * Fills are never invented. Ready frames (`type: "ready"`) are honesty about
 * the bus, not a snapshot.
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
  /**
   * Soft ceiling per principal so one user cannot fill the whole replica pool.
   * Defaults to 16 when omitted (env: `WS_PRIVATE_MAX_CONNECTIONS_PER_USER`).
   */
  readonly maxConnectionsPerUser?: number;
  /**
   * Optional cold-start fetch (tests / future matching blotter). Empty or throw
   * is absence — never flushed as `{ orders: [] }`. Fills are never seeded.
   */
  readonly seedOrders?: (userId: string) => Promise<readonly PrivateOrderUpdate[]>;
  /**
   * Optional cold-start fetch for positions. Empty or throw is absence — never
   * flushed as `{ positions: [] }`.
   */
  readonly seedPositions?: (userId: string) => Promise<readonly PrivatePositionUpdate[]>;
}

/**
 * `{ orders: [] }` / `{ positions: [] }` / `{ fills: [] }` / JSON `[]` on the
 * wire is a priced empty blotter. Empty is absent: no frame, not a live zero
 * book of nothing. Ready frames are not a snapshot.
 */
export function isLiveZeroBlotterPayload(value: unknown): boolean {
  if (Array.isArray(value) && value.length === 0) return true;
  if (value === null || typeof value !== 'object') return false;
  const rec = value as Record<string, unknown>;
  if (rec.type === 'ready') return false;
  for (const key of ['orders', 'positions', 'fills'] as const) {
    if (key in rec && Array.isArray(rec[key]) && rec[key].length === 0) return true;
  }
  return false;
}

export function isLiveZeroBlotterFrame(frame: string): boolean {
  try {
    return isLiveZeroBlotterPayload(JSON.parse(frame) as unknown);
  } catch {
    return false;
  }
}

interface Subscription {
  readonly userId: string;
  readonly sink: PrivateSink;
  lagTicks: number;
  closed: boolean;
}

const NO_LOG: HubLogger = { info: () => undefined, warn: () => undefined };

const READY_CHANNELS = ['orders', 'fills', 'positions'] as const;

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

  /** Per-hub seat ceiling (same bound attach enforces). Not process-wide. */
  get maxConnections(): number {
    return this.#options.maxConnections;
  }

  /** Per-principal cap on the private hub. Default matches attach (16). */
  get maxConnectionsPerUser(): number {
    return this.#options.maxConnectionsPerUser ?? 16;
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

    const maxPerUser = this.#options.maxConnectionsPerUser ?? 16;
    let forUser = 0;
    for (const existing of this.#subscriptions) {
      if (!existing.closed && existing.userId === userId) forUser++;
    }
    if (forUser >= maxPerUser) {
      sink.close(CLOSE_TRY_LATER, 'too many private connections for this user');
      return null;
    }

    const sub: Subscription = { userId, sink, lagTicks: 0, closed: false };
    this.#subscriptions.add(sub);
    if (this.#options.seedOrders || this.#options.seedPositions) {
      void this.#seed(sub);
    }
    return () => {
      sub.closed = true;
      this.#subscriptions.delete(sub);
    };
  }

  /**
   * Matching 404 / empty / throw is absence. Replay real rows only — never
   * `{ orders: [] }` or `{ positions: [] }`. Fills are never seeded.
   */
  async #seed(sub: Subscription): Promise<void> {
    if (this.#options.seedOrders) {
      try {
        const orders = await this.#options.seedOrders(sub.userId);
        if (orders.length === 0) {
          this.#log.warn(
            { userId: sub.userId },
            'ws-private: order seed empty — no blotter on the wire; live orders publish when they exist',
          );
        } else {
          for (const order of orders) {
            if (sub.closed) return;
            this.#write(sub, JSON.stringify({ channel: 'orders', ...order }));
          }
        }
      } catch (err) {
        this.#log.warn(
          { userId: sub.userId, err: err instanceof Error ? err.message : String(err) },
          'ws-private: order seed failed — no blotter on the wire; matching 404 is absence not { orders: [] }',
        );
      }
    }
    if (sub.closed) return;
    if (this.#options.seedPositions) {
      try {
        const positions = await this.#options.seedPositions(sub.userId);
        if (positions.length === 0) {
          this.#log.warn(
            { userId: sub.userId },
            'ws-private: position seed empty — no blotter on the wire; live positions publish when they exist',
          );
        } else {
          for (const position of positions) {
            if (sub.closed) return;
            this.#write(sub, JSON.stringify({ channel: 'positions', ...position }));
          }
        }
      } catch (err) {
        this.#log.warn(
          { userId: sub.userId, err: err instanceof Error ? err.message : String(err) },
          'ws-private: position seed failed — no blotter on the wire; matching 404 is absence not { positions: [] }',
        );
      }
    }
  }

  /**
   * Re-announce channel ready + bus honesty to every live seat.
   * Used when the private half attaches after sockets already connected
   * with `bus: false` (boot tape-up / private-down). Does not invent
   * order/fill/position frames.
   */
  announceBus(bus: boolean): void {
    for (const sub of this.#subscriptions) {
      if (sub.closed) continue;
      for (const channel of READY_CHANNELS) {
        this.#write(sub, JSON.stringify({ channel, type: 'ready', userId: sub.userId, bus }));
      }
    }
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
        this.#noteLag(sub);
        continue;
      }

      sub.lagTicks = 0;
      this.#write(sub, frame);
    }
  }

  #write(sub: Subscription, frame: string): void {
    if (sub.closed) return;
    if (isLiveZeroBlotterFrame(frame)) {
      this.#log.warn({ userId: sub.userId }, 'ws-private: refused live-zero blotter frame');
      return;
    }
    try {
      sub.sink.send(frame);
    } catch {
      sub.closed = true;
      this.#subscriptions.delete(sub);
    }
  }

  /**
   * Quiet-period lag sweep. Publish-path lag only fires when events arrive for
   * that user — a slow socket that stops draining can pin a seat forever if
   * the market is quiet. Gateway heartbeat calls this so private matches depth:
   * lag over high-water for maxLagTicks → 1013, seat freed.
   */
  sweepLag(): void {
    for (const sub of [...this.#subscriptions]) {
      if (sub.closed) continue;
      if (sub.sink.bufferedBytes > this.#options.highWaterBytes) {
        this.#noteLag(sub);
      } else {
        sub.lagTicks = 0;
      }
    }
  }

  #noteLag(sub: Subscription): void {
    sub.lagTicks++;
    this.#droppedFrames++;
    if (sub.lagTicks < this.#options.maxLagTicks) return;
    this.#evictions++;
    sub.closed = true;
    this.#subscriptions.delete(sub);
    // Align with depth/trade: lag is try-later (1013), not policy (1008).
    try {
      sub.sink.close(
        CLOSE_TRY_LATER,
        `slow consumer: outbound buffer over ${this.#options.highWaterBytes} bytes for ${sub.lagTicks} ticks`,
      );
    } catch {
      /* already gone */
    }
    this.#log.warn({ userId: sub.userId }, 'ws-private: evicted lagging client');
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
