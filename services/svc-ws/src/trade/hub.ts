import { tradePrintFromFill, type FillLike, type TradePrint } from '@intafaced/market-data';
import { CLOSE_GOING_AWAY, CLOSE_POLICY, CLOSE_TRY_LATER, type DepthSink, type HubLogger } from '../depth/hub.js';

/**
 * TRADE TAPE FAN-OUT (§5.2 ws.gateway).
 *
 * Subscribers get public `TradePrint` frames only. Source is `orderFilled` on
 * the bus (wired in `trade/source.ts`); this hub never sees a principal, never
 * holds a balance, and never puts order ids on the wire — `tradePrintFromFill`
 * is the strip.
 *
 * ── Recent buffer, not a book ───────────────────────────────────────────────
 *
 * Depth needs a sequenced book. Trades do not: each print stands alone and
 * `sequence` is only a dedupe key. On connect we replay the last N prints for
 * the market **while someone is watching** so a mid-stream joiner is not empty,
 * then stream live. A ring bound (`recentLimit`) caps history for watched markets.
 * Unwatched markets store nothing — otherwise every `orderFilled` on the bus
 * would pin memory forever for markets nobody opened.
 *
 * ── Backpressure ────────────────────────────────────────────────────────────
 *
 * Same policy as depth, simpler: over the high-water mark a print is dropped
 * (a tape that misses a print is still a valid tape; the next one is not a
 * gap in the depth sense), and a client still stuck after `maxLagTicks`
 * consecutive drops is disconnected. No per-client queue.
 */

/** Same shape as a depth sink — real sockets and fakes both satisfy it. */
export type TradeSink = DepthSink;

export interface TradeHubOptions {
  readonly highWaterBytes: number;
  readonly maxLagTicks: number;
  readonly maxConnections: number;
  /** How many recent prints to keep per market and replay on connect. */
  readonly recentLimit: number;
  /**
   * Market-list gate. Same reason as depth: an arbitrary market id is not a
   * 404 on the engine, so we refuse anything not on the known list.
   */
  readonly ensureKnownMarket: (marketId: string) => Promise<boolean>;
}

interface Subscription {
  readonly marketId: string;
  readonly sink: TradeSink;
  /** True until the recent-buffer replay has been written. */
  pending: boolean;
  lagTicks: number;
  closed: boolean;
}

const NO_LOG: HubLogger = { info: () => undefined, warn: () => undefined };

export class TradeHub {
  readonly #options: TradeHubOptions;
  readonly #log: HubLogger;

  readonly #subscriptions = new Set<Subscription>();
  /** Per-market ring of the most recent public prints. */
  readonly #recent = new Map<string, TradePrint[]>();
  /** Sequences already accepted, so a JetStream redelivery is a no-op. */
  readonly #seen = new Map<string, Set<number>>();

  #droppedFrames = 0;
  #evictions = 0;
  #prints = 0;

  constructor(options: TradeHubOptions, log: HubLogger = NO_LOG) {
    this.#options = options;
    this.#log = log;
  }

  get connections(): number {
    return this.#subscriptions.size;
  }

  get stats(): { connections: number; markets: number; prints: number; droppedFrames: number; evictions: number } {
    return {
      connections: this.#subscriptions.size,
      markets: this.#recent.size,
      prints: this.#prints,
      droppedFrames: this.#droppedFrames,
      evictions: this.#evictions,
    };
  }

  /** Recent public prints for a market, oldest first. */
  recentFor(marketId: string): readonly TradePrint[] {
    return this.#recent.get(marketId) ?? [];
  }

  /**
   * Register a sink. Synchronous so the socket handler can wire `close` before
   * anything awaits. Recent prints flush on a later turn.
   */
  /**
   * Register a sink. Returns detach, or `null` when at capacity (sink already
   * closed with 1013). Real sockets must terminate on null — no half-open seat.
   */
  attach(marketId: string, sink: TradeSink): (() => void) | null {
    if (this.#subscriptions.size >= this.#options.maxConnections) {
      sink.close(CLOSE_TRY_LATER, 'gateway at capacity');
      return null;
    }

    const sub: Subscription = { marketId, sink, pending: true, lagTicks: 0, closed: false };
    this.#subscriptions.add(sub);
    void this.#open(sub);

    return () => {
      sub.closed = true;
      this.#subscriptions.delete(sub);
      this.#forgetIdleMarket(marketId);
    };
  }

  /**
   * Drop the recent ring and dedupe set when nobody is watching a market.
   * Depth forgets idle books the same way — keeping tape history forever would
   * pin memory for every market that ever printed, even after the last client left.
   * A later reconnect replays empty (honest), not a stale multi-hour buffer.
   */
  #forgetIdleMarket(marketId: string): void {
    for (const s of this.#subscriptions) {
      if (!s.closed && s.marketId === marketId) return;
    }
    this.#recent.delete(marketId);
    this.#seen.delete(marketId);
  }

  async #open(sub: Subscription): Promise<void> {
    try {
      if (!(await this.#options.ensureKnownMarket(sub.marketId))) {
        this.#evict(sub, CLOSE_POLICY, `unknown market "${sub.marketId}"`);
        return;
      }
      if (sub.closed) return;
      this.#flush(sub);
    } catch (err) {
      this.#evict(sub, CLOSE_TRY_LATER, err instanceof Error ? err.message : 'trades unavailable');
    }
  }

  /** Replay the ring, then mark the subscription live. */
  #flush(sub: Subscription): void {
    if (sub.closed || !sub.pending) return;

    for (const print of this.#recent.get(sub.marketId) ?? []) {
      if (sub.closed) return;
      this.#write(sub, JSON.stringify(print));
    }
    sub.pending = false;
  }

  /**
   * Ingest a fill-shaped payload (typically an `orderFilled` event). Returns
   * the public print that was stored, or `null` when it was a duplicate,
   * rejected by the shape check, or dropped because nobody is watching the market.
   */
  ingest(fill: FillLike): TradePrint | null {
    let print: TradePrint;
    try {
      print = tradePrintFromFill(fill);
    } catch (err) {
      this.#log.warn(
        { err: err instanceof Error ? err.message : String(err), marketId: fill.marketId, sequence: fill.sequence },
        'ws: trade print rejected',
      );
      return null;
    }

    // No watchers → no ring, no fan-out. Leaving the ring grow for idle markets
    // would re-pin memory after #forgetIdleMarket and for markets never opened.
    if (!this.#hasWatcher(print.marketId)) {
      return null;
    }

    const seen = this.#seen.get(print.marketId) ?? new Set<number>();
    if (seen.has(print.sequence)) return null;
    seen.add(print.sequence);
    this.#seen.set(print.marketId, seen);

    // Bound the dedupe set to the ring. Sequences older than the ring can
    // re-arrive only after a full JetStream replay, which is a process restart
    // and a fresh hub.
    const ring = this.#recent.get(print.marketId) ?? [];
    ring.push(print);
    while (ring.length > this.#options.recentLimit) {
      const dropped = ring.shift();
      if (dropped) seen.delete(dropped.sequence);
    }
    this.#recent.set(print.marketId, ring);
    this.#prints += 1;

    this.#fanOut(print);
    return print;
  }

  #hasWatcher(marketId: string): boolean {
    for (const s of this.#subscriptions) {
      if (!s.closed && s.marketId === marketId) return true;
    }
    return false;
  }

  #fanOut(print: TradePrint): void {
    const frame = JSON.stringify(print);

    for (const sub of [...this.#subscriptions]) {
      if (sub.closed || sub.marketId !== print.marketId) continue;

      // Still replaying history — live prints land in the ring and are
      // included when flush runs, so do not double-send.
      if (sub.pending) continue;

      if (sub.sink.bufferedBytes > this.#options.highWaterBytes) {
        sub.lagTicks += 1;
        this.#droppedFrames += 1;
        if (sub.lagTicks >= this.#options.maxLagTicks) {
          this.#evictions += 1;
          this.#evict(
            sub,
            CLOSE_TRY_LATER,
            `slow consumer: outbound buffer over ${this.#options.highWaterBytes} bytes for ${sub.lagTicks} ticks`,
          );
        }
        continue;
      }

      sub.lagTicks = 0;
      this.#write(sub, frame);
    }
  }

  #write(sub: Subscription, frame: string): void {
    try {
      sub.sink.send(frame);
    } catch (err) {
      this.#evict(sub, CLOSE_GOING_AWAY, err instanceof Error ? err.message : 'send failed');
    }
  }

  #evict(sub: Subscription, code: number, reason: string): void {
    if (sub.closed) return;
    sub.closed = true;
    this.#subscriptions.delete(sub);
    try {
      sub.sink.close(code, reason);
    } catch {
      /* already gone */
    }
    this.#forgetIdleMarket(sub.marketId);
  }

  closeAll(code: number, reason: string): void {
    for (const sub of [...this.#subscriptions]) this.#evict(sub, code, reason);
  }
}
