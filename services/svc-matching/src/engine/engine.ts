import { formatAmount } from '@intafaced/ledger-client/money';
import type { EventBus, PayloadOf } from '@intafaced/events';
import { withEngineSpan } from '../tracing.js';
import { OrderBook } from './book.js';
import { replay, serializeBooks, snapshotAll, toWire, type EngineJournal, type EngineSnapshot, type JournalRecord } from './journal.js';
import type { CancelResult, CancelledRef, EngineOrder, Fill, MarketId, OrderId, SubmitResult, TriggerOutcome } from './types.js';

/**
 * THE MATCHING ENGINE (§5.1).
 *
 * Books per market, the journal in front of them, and the event stream out the
 * back. Everything the engine does that is not pure matching lives here, so
 * `book.ts` can stay a pure function of (state, order) — the property §5.4's
 * determinism test rests on.
 *
 * What this service does NOT do, and must never start doing:
 *   - hold a balance (Doctrine §0.6 — the ledger is the only place one exists)
 *   - post a ledger transaction (svc-trade turns `orderFilled` into a
 *     `tradeFill` recipe; the engine never sees an asset, a fee, or a user)
 *   - validate that an account can afford an order (§5.1: orders arrive
 *     pre-validated, held funds and all)
 *
 * It speaks in account ids and quantities and nothing else.
 */

/** Where periodic book snapshots go. §5.1: "Snapshot every N events to Redis for ws-gateway depth streaming". */
export interface SnapshotSink {
  write(snapshot: EngineSnapshot): Promise<void> | void;
}

/** Default sink: keeps the last snapshot in memory so `/ready` and tests can see one without Redis. */
export class MemorySnapshotSink implements SnapshotSink {
  latest: EngineSnapshot | null = null;

  write(snapshot: EngineSnapshot): void {
    this.latest = snapshot;
  }
}

export interface MatchingEngineOptions {
  readonly journal: EngineJournal;
  readonly bus: EventBus;
  /**
   * Injected so replay is reproducible. The book never reads a clock; only
   * event payloads carry a timestamp, and that timestamp is journalled.
   */
  readonly clock?: () => Date;
  readonly snapshotEvery?: number;
  readonly snapshotSink?: SnapshotSink;
  /** Kill-switch mirror of the `matching.engine` flag (§14 admin controls). */
  readonly enabled?: boolean;
}

type PendingEvent =
  | { readonly sequence: number; readonly name: 'orderAccepted'; readonly payload: PayloadOf<'orderAccepted'>; readonly key: string }
  | { readonly sequence: number; readonly name: 'orderFilled'; readonly payload: PayloadOf<'orderFilled'>; readonly key: string }
  | { readonly sequence: number; readonly name: 'orderCancelled'; readonly payload: PayloadOf<'orderCancelled'>; readonly key: string };

export class MatchingEngine {
  private readonly books = new Map<MarketId, OrderBook>();
  private readonly journal: EngineJournal;
  private readonly bus: EventBus;
  private readonly clock: () => Date;
  private readonly snapshotEvery: number;
  private readonly sink: SnapshotSink;
  private enabled: boolean;

  constructor(options: MatchingEngineOptions) {
    this.journal = options.journal;
    this.bus = options.bus;
    this.clock = options.clock ?? (() => new Date());
    this.snapshotEvery = options.snapshotEvery ?? 500;
    this.sink = options.snapshotSink ?? new MemorySnapshotSink();
    this.enabled = options.enabled ?? true;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * §5.1's recovery guarantee: rebuild every book by replaying the journal.
   *
   * Nothing is emitted during recovery. The events for those inputs were
   * published the first time round; republishing them would hand svc-trade a
   * second `tradeFill` for a trade that already settled.
   */
  recover(): { records: number; markets: number } {
    const records: readonly JournalRecord[] = this.journal.read();
    this.books.clear();
    for (const [marketId, book] of replay(records)) this.books.set(marketId, book);
    return { records: records.length, markets: this.books.size };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  // ── Read surface ──────────────────────────────────────────────────────────

  /**
   * Get or create a book. Creation is correct here: an order for a market that
   * has not traded yet is the first order in that market, and refusing it would
   * mean no market could ever open.
   *
   * WRITES ONLY. See `existingBook` for reads and why the distinction matters.
   */
  book(marketId: MarketId): OrderBook {
    let book = this.books.get(marketId);
    if (!book) {
      book = new OrderBook(marketId);
      this.books.set(marketId, book);
    }
    return book;
  }

  /**
   * Look up a book without creating one.
   *
   * `depth()` used to go through `book()`, which allocated and STORED an
   * OrderBook for any string it was handed. The depth route is unauthenticated
   * — deliberately, because a price is not a secret (#55) — so
   * `GET /markets/<anything>/depth` was an unbounded memory-growth primitive
   * against the engine, drivable from any browser once a public websocket
   * existed.
   *
   * Found while building svc-ws, which guards its own path by validating the
   * market against `GET /markets` first. That guard is right, but it protects
   * one caller; this protects the engine.
   *
   * A read must never mutate the thing it is reading. That is the general rule
   * and this was a live counter-example.
   */
  existingBook(marketId: MarketId): OrderBook | null {
    return this.books.get(marketId) ?? null;
  }

  hasMarket(marketId: MarketId): boolean {
    return this.books.has(marketId);
  }

  get markets(): readonly MarketId[] {
    return [...this.books.keys()].sort();
  }

  /**
   * Depth for a market, or null if it has never traded.
   *
   * null rather than an empty book: "this market does not exist" and "this
   * market exists and nobody is quoting" are different facts, and a caller
   * rendering an empty ladder for a typo'd symbol is showing a market that
   * isn't there.
   */
  depth(marketId: MarketId, limit = 50): ReturnType<OrderBook['depth']> | null {
    return this.existingBook(marketId)?.depth(limit) ?? null;
  }

  snapshot(): EngineSnapshot {
    return snapshotAll(this.books, this.journal.length);
  }

  /** Canonical state of every book — the string §5.4's determinism test compares. */
  serialize(): string {
    return serializeBooks(this.books);
  }

  // ── Write surface ─────────────────────────────────────────────────────────

  async submit(marketId: MarketId, order: EngineOrder): Promise<SubmitResult> {
    return withEngineSpan(
      'matching.submit',
      { marketId, orderId: order.orderId, side: order.side, orderType: order.type, tif: order.tif },
      async (): Promise<SubmitResult & { fillCount: number; rejectCode?: string }> => {
        if (!this.enabled) {
          // Refused before the journal, not after: an input the engine did not
          // process must not appear in a log whose whole meaning is "these were
          // processed, in this order".
          const result = disabled(order.orderId);
          return { ...result, fillCount: 0, rejectCode: result.rejected?.code };
        }

        const at = this.clock().toISOString();
        // BEFORE processing (§5.1). This ordering is the recovery guarantee.
        this.journal.append({ kind: 'submit', marketId, at, order: toWire(order) });

        const result = this.book(marketId).submit(order);
        await this.emit(this.eventsForSubmit(marketId, order.orderId, result, at));
        await this.maybeSnapshot();

        return { ...result, fillCount: result.fills.length, rejectCode: result.rejected?.code };
      },
    );
  }

  async cancel(marketId: MarketId, orderId: OrderId): Promise<CancelResult> {
    return withEngineSpan('matching.cancel', { marketId, orderId }, async (): Promise<CancelResult & { fillCount: number }> => {
      const at = this.clock().toISOString();
      this.journal.append({ kind: 'cancel', marketId, at, orderId });

      const result = this.book(marketId).cancel(orderId);
      if (result.cancellation) await this.emit([cancelledEvent(marketId, result.cancellation)]);
      await this.maybeSnapshot();

      return { ...result, fillCount: 0 };
    });
  }

  // ── Events (§10 — the bus is a contract) ──────────────────────────────────

  /**
   * Build the event stream for one submission.
   *
   * Sorted by engine sequence, so a consumer reading the subject in order sees
   * the same order the book applied. `orderAccepted` is emitted once, at
   * admission — a stop order that rests and triggers an hour later does not get
   * a second acceptance, because it was accepted an hour ago.
   */
  private eventsForSubmit(marketId: MarketId, orderId: OrderId, result: SubmitResult, at: string): PendingEvent[] {
    const events: PendingEvent[] = [];

    if (result.accepted && result.sequence !== null) {
      events.push({
        sequence: result.sequence,
        name: 'orderAccepted',
        payload: { orderId, marketId, sequence: result.sequence },
        // The order id is the business key §15's idempotency rule asks for: a
        // resubmitted acceptance must find the original, not open a second one.
        key: `matching.order.accepted:${marketId}:${orderId}`,
      });
    }

    const collect = (fills: readonly Fill[], cancellations: readonly CancelledRef[]): void => {
      for (const fill of fills) events.push(filledEvent(marketId, fill, at));
      for (const cancellation of cancellations) events.push(cancelledEvent(marketId, cancellation));
    };

    collect(result.fills, result.cancellations);
    for (const triggered of result.triggered as readonly TriggerOutcome[]) collect(triggered.fills, triggered.cancellations);

    return events.sort((a, b) => a.sequence - b.sequence);
  }

  private async emit(events: readonly PendingEvent[]): Promise<void> {
    for (const event of events) {
      const opts = { idempotencyKey: event.key };
      // Switched rather than a generic call so the payload type is checked
      // against the catalog schema at compile time, not just at publish time.
      switch (event.name) {
        case 'orderAccepted':
          await this.bus.publish('orderAccepted', event.payload, opts);
          break;
        case 'orderFilled':
          await this.bus.publish('orderFilled', event.payload, opts);
          break;
        case 'orderCancelled':
          await this.bus.publish('orderCancelled', event.payload, opts);
          break;
      }
    }
  }

  private async maybeSnapshot(): Promise<void> {
    if (this.snapshotEvery <= 0) return;
    if (this.journal.length % this.snapshotEvery !== 0) return;
    await this.sink.write(this.snapshot());
  }
}

// ── Event builders ──────────────────────────────────────────────────────────

function filledEvent(marketId: MarketId, fill: Fill, at: string): PendingEvent {
  return {
    sequence: fill.sequence,
    name: 'orderFilled',
    payload: {
      marketId,
      makerOrderId: fill.makerOrderId,
      takerOrderId: fill.takerOrderId,
      // Decimal strings on the wire, always (§6, Doctrine §0.6).
      price: formatAmount(fill.price),
      qty: formatAmount(fill.qty),
      sequence: fill.sequence,
      ts: at,
      // STP account ids — svc-trade recovery uses makerAccountId for house MM
      // (no trade.orders row). Never invent; take from the engine fill only.
      makerAccountId: fill.makerAccountId,
      takerAccountId: fill.takerAccountId,
    },
    // The engine sequence is the business key: one fill, one sequence, forever.
    key: `matching.order.filled:${marketId}:${fill.sequence}`,
  };
}

function cancelledEvent(marketId: MarketId, cancellation: CancelledRef): PendingEvent {
  return {
    sequence: cancellation.sequence,
    name: 'orderCancelled',
    payload: {
      orderId: cancellation.orderId,
      marketId,
      remainingQty: formatAmount(cancellation.remainingQty),
      sequence: cancellation.sequence,
    },
    key: `matching.order.cancelled:${marketId}:${cancellation.sequence}`,
  };
}

function disabled(orderId: OrderId): SubmitResult {
  return {
    accepted: false,
    sequence: null,
    fills: [],
    resting: null,
    rejected: { code: 'engine_disabled', message: `matching engine is disabled — order ${orderId} not processed` },
    cancellations: [],
    triggered: [],
  };
}
