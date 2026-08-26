import { ZERO, formatAmount } from '@intafaced/ledger-client/money';
import type { MarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import type { EventBus, PayloadOf } from '@intafaced/events';
import { withEngineSpan } from '../tracing.js';
import { OrderBook } from './book.js';
import './trailing-stop.js';
import { flattenCloseOrder, netPositionOf, positionFlatResult, type ClosePositionCommand } from './close-position.js';
import { haltedAmendResult, haltedSubmitResult, operatorRefuse, readOperatorId, replayHaltedMarkets } from './halt.js';
import {
  reduceOnlyMarketAmendResult,
  reduceOnlyMarketSubmitResult,
  replayReduceOnlyMarkets,
  wouldOpenOrIncrease,
} from './reduce-only-market.js';
import { isPostOnlySubmit, postOnlyMarketSubmitResult, replayPostOnlyMarkets } from './post-only-market.js';
import { massCancelSessionRefuse, readMassCancelSide, readSessionId } from './mass-cancel.js';
import {
  replay,
  serializeBooks,
  snapshotAll,
  toWire,
  toWireAmend,
  type EngineJournal,
  type EngineSnapshot,
  type JournalRecord,
} from './journal.js';
import type {
  AmendResult,
  CancelResult,
  CancelledRef,
  EngineAmend,
  EngineLiveOrder,
  EngineOrder,
  Fill,
  MarketHaltResult,
  MarketId,
  MarketPostOnlyResult,
  MarketReduceOnlyResult,
  MassCancelResult,
  OrderId,
  OrderSide,
  PriceLevelState,
  SubmitResult,
  TriggerOutcome,
} from './types.js';

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
  /** Set only when a clock was injected. GTD/GTT refuse when this is missing. */
  private readonly expiryClock: (() => Date) | null;
  private readonly snapshotEvery: number;
  private readonly sink: SnapshotSink;
  private enabled: boolean;
  /** One-market operator halt. Not the process kill-switch. No duration. */
  private readonly halted = new Set<MarketId>();
  /** One-market operator reduce-only. Not halt. No duration. */
  private readonly reduceOnlyMarkets = new Set<MarketId>();
  /** One-market operator post-only. Not halt. No duration. */
  private readonly postOnlyMarkets = new Set<MarketId>();

  constructor(options: MatchingEngineOptions) {
    this.journal = options.journal;
    this.bus = options.bus;
    this.clock = options.clock ?? (() => new Date());
    this.expiryClock = options.clock ?? null;
    this.snapshotEvery = options.snapshotEvery ?? 500;
    this.sink = options.snapshotSink ?? new MemorySnapshotSink();
    this.enabled = options.enabled ?? true;
  }

  recover(): { records: number; markets: number } {
    const records: readonly JournalRecord[] = this.journal.read();
    this.books.clear();
    this.halted.clear();
    this.reduceOnlyMarkets.clear();
    this.postOnlyMarkets.clear();
    for (const [marketId, book] of replay(records)) this.books.set(marketId, book);
    for (const marketId of replayHaltedMarkets(records)) this.halted.add(marketId);
    for (const marketId of replayReduceOnlyMarkets(records)) this.reduceOnlyMarkets.add(marketId);
    for (const marketId of replayPostOnlyMarkets(records)) this.postOnlyMarkets.add(marketId);
    return { records: records.length, markets: this.books.size };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  isHalted(marketId: MarketId): boolean {
    return this.halted.has(marketId);
  }

  isReduceOnly(marketId: MarketId): boolean {
    return this.reduceOnlyMarkets.has(marketId);
  }

  isPostOnly(marketId: MarketId): boolean {
    return this.postOnlyMarkets.has(marketId);
  }

  book(marketId: MarketId): OrderBook {
    let book = this.books.get(marketId);
    if (!book) {
      book = new OrderBook(marketId);
      this.books.set(marketId, book);
    }
    return book;
  }

  existingBook(marketId: MarketId): OrderBook | null {
    return this.books.get(marketId) ?? null;
  }

  private dropIfNeverTraded(marketId: MarketId): void {
    const book = this.books.get(marketId);
    if (book?.isNeverPrintedEmpty) this.books.delete(marketId);
  }

  hasMarket(marketId: MarketId): boolean {
    return this.books.has(marketId);
  }

  get markets(): readonly MarketId[] {
    return [...this.books.keys()].sort();
  }

  depth(marketId: MarketId, limit = 50): ReturnType<OrderBook['depth']> | null {
    return this.existingBook(marketId)?.depth(limit) ?? null;
  }

  restingOrders(marketId?: MarketId): readonly EngineLiveOrder[] {
    const books = marketId === undefined ? [...this.books.values()] : [this.books.get(marketId)].filter((b): b is OrderBook => b != null);

    const live: EngineLiveOrder[] = [];

    for (const book of books) {
      const state = book.toState();

      const takeSide = (levels: readonly PriceLevelState[], side: OrderSide): void => {
        for (const level of levels) {
          for (const order of level.orders) {
            live.push({
              marketId: state.marketId,
              orderId: order.orderId,
              accountId: order.accountId,
              kind: 'book',
              side,
              price: level.price,
              remaining: order.remaining,
              sequence: order.sequence,
              version: order.version && order.version > 0 ? order.version : 1,
            });
          }
        }
      };

      takeSide(state.bids, 'buy');
      takeSide(state.asks, 'sell');

      for (const stop of state.stops) {
        live.push({
          marketId: state.marketId,
          orderId: stop.orderId,
          accountId: stop.accountId,
          kind: 'stop',
          side: stop.side,
          price: stop.stopPrice,
          remaining: stop.qty,
          sequence: stop.sequence,
          version: stop.version && stop.version > 0 ? stop.version : 1,
        });
      }
    }

    return live.sort((a, b) => (a.marketId === b.marketId ? a.sequence - b.sequence : a.marketId < b.marketId ? -1 : 1));
  }

  get restingOrderCount(): number {
    return this.restingOrders().length;
  }

  snapshot(): EngineSnapshot {
    return snapshotAll(this.books, this.journal.length);
  }

  serialize(): string {
    return serializeBooks(this.books);
  }

  async submit(marketId: MarketId, order: EngineOrder, lifecycleProof?: MarketLifecycleAdmissionProof): Promise<SubmitResult> {
    return withEngineSpan(
      'matching.submit',
      { marketId, orderId: order.orderId, side: order.side, orderType: order.type, tif: order.tif },
      async (): Promise<SubmitResult & { fillCount: number; rejectCode?: string }> => {
        if (!this.enabled) {
          const result = disabled(order.orderId);
          return { ...result, fillCount: 0, rejectCode: result.rejected?.code };
        }
        if (this.halted.has(marketId)) {
          const result = haltedSubmitResult(marketId, order.orderId);
          return { ...result, fillCount: 0, rejectCode: result.rejected?.code };
        }
        if (this.reduceOnlyMarkets.has(marketId) && wouldOpenOrIncrease(this.existingBook(marketId), order)) {
          const result = reduceOnlyMarketSubmitResult(marketId, order.orderId);
          return { ...result, fillCount: 0, rejectCode: result.rejected?.code };
        }
        if (this.postOnlyMarkets.has(marketId) && !isPostOnlySubmit(order)) {
          const result = postOnlyMarketSubmitResult(marketId, order.orderId);
          return { ...result, fillCount: 0, rejectCode: result.rejected?.code };
        }

        const at = this.clock().toISOString();
        this.journal.append({ kind: 'submit', marketId, at, order: toWire(order, lifecycleProof) });

        const result = this.book(marketId).submit(order, this.expiryClock ? this.expiryClock() : null);
        this.dropIfNeverTraded(marketId);
        await this.emit(this.eventsForSubmit(marketId, order.orderId, result, at));
        await this.maybeSnapshot();

        return { ...result, fillCount: result.fills.length, rejectCode: result.rejected?.code };
      },
    );
  }

  async cancel(marketId: MarketId, orderId: OrderId): Promise<CancelResult> {
    return withEngineSpan('matching.cancel', { marketId, orderId }, async (): Promise<CancelResult & { fillCount: number }> => {
      const existing = this.existingBook(marketId);
      if (!existing) {
        return { cancelled: false, orderId, sequence: null, cancellation: null, fillCount: 0 };
      }

      const at = this.clock().toISOString();
      this.journal.append({ kind: 'cancel', marketId, at, orderId });

      const result = existing.cancel(orderId);
      if (result.cancellation) await this.emit([cancelledEvent(marketId, result.cancellation)]);
      await this.maybeSnapshot();

      return { ...result, fillCount: 0 };
    });
  }

  /**
   * Pull live rest/stop for this account on this book.
   * Owner is accountId. Present side is that side only; missing/null is both.
   * Session is not on the book — a session id refuses.
   * Missing account cannot apply. Unknown market journals nothing.
   */
  async massCancel(
    marketId: MarketId,
    cmd: { readonly accountId: string; readonly sessionId?: string | null; readonly side?: OrderSide | null },
  ): Promise<MassCancelResult> {
    return withEngineSpan('matching.massCancel', { marketId }, async (): Promise<MassCancelResult & { fillCount: number }> => {
      const sessionRefuse = massCancelSessionRefuse(readSessionId(cmd));
      if (sessionRefuse) {
        return {
          accepted: false,
          accountId: cmd.accountId,
          cancellations: [],
          rejected: { code: sessionRefuse.code, message: sessionRefuse.message },
          fillCount: 0,
        };
      }

      const existing = this.existingBook(marketId);
      if (!existing) {
        return { accepted: true, accountId: cmd.accountId, cancellations: [], fillCount: 0 };
      }

      const side = readMassCancelSide(cmd);
      const at = this.clock().toISOString();
      this.journal.append({
        kind: 'mass_cancel',
        marketId,
        at,
        accountId: cmd.accountId,
        ...(side ? { side } : {}),
      });

      const cancellations = existing.cancelAccount(cmd.accountId, side);
      this.dropIfNeverTraded(marketId);
      if (cancellations.length > 0) {
        await this.emit(cancellations.map((cancellation) => cancelledEvent(marketId, cancellation)));
      }
      await this.maybeSnapshot();

      return { accepted: true, accountId: cmd.accountId, cancellations, fillCount: 0 };
    });
  }

  async amend(marketId: MarketId, cmd: EngineAmend, lifecycleProof?: MarketLifecycleAdmissionProof): Promise<AmendResult> {
    return withEngineSpan(
      'matching.amend',
      { marketId, orderId: cmd.orderId, tif: cmd.tif },
      async (): Promise<AmendResult & { fillCount: number; rejectCode?: string }> => {
        if (!this.enabled) {
          const result = disabledAmend(cmd.orderId);
          return { ...result, fillCount: 0, rejectCode: result.rejected?.code };
        }
        if (this.halted.has(marketId)) {
          const result = haltedAmendResult(marketId, cmd.orderId);
          return { ...result, fillCount: 0, rejectCode: result.rejected?.code };
        }
        if (this.reduceOnlyMarkets.has(marketId) && cmd.qty !== undefined) {
          const live = this.restingOrders(marketId).find((row) => row.orderId === cmd.orderId);
          if (live && wouldOpenOrIncrease(this.existingBook(marketId), { accountId: live.accountId, side: live.side, qty: cmd.qty })) {
            const result = reduceOnlyMarketAmendResult(marketId, cmd.orderId);
            return { ...result, fillCount: 0, rejectCode: result.rejected?.code };
          }
        }

        const existing = this.existingBook(marketId);
        if (!existing) {
          return {
            accepted: false,
            orderId: cmd.orderId,
            sequence: null,
            version: null,
            priority: null,
            fills: [],
            resting: null,
            rejected: { code: 'order_not_found', message: `order ${cmd.orderId} is not live in ${marketId}` },
            cancellations: [],
            triggered: [],
            fillCount: 0,
            rejectCode: 'order_not_found',
          };
        }

        const at = this.clock().toISOString();
        this.journal.append({
          kind: 'amend',
          marketId,
          at,
          orderId: cmd.orderId,
          expectedVersion: cmd.expectedVersion,
          patch: toWireAmend(cmd),
          lifecycleProof,
        });

        const result = existing.amend(cmd);
        this.dropIfNeverTraded(marketId);
        await this.emit(this.eventsForAmend(marketId, result, at));
        await this.maybeSnapshot();

        return { ...result, fillCount: result.fills.length, rejectCode: result.rejected?.code };
      },
    );
  }

  /**
   * Flatten the account's net fill position on this book.
   *
   * Position is net fills. The engine does not invent a mark. Qty is exactly
   * the signed net; side is sell if long, buy if short. A flat account or a
   * market that has never traded refuses `position_flat` without creating a
   * book or journaling. The flatten itself is one `submit` so replay stays
   * one door.
   */
  async closePosition(
    marketId: MarketId,
    cmd: ClosePositionCommand,
    lifecycleProof?: MarketLifecycleAdmissionProof,
  ): Promise<SubmitResult> {
    if (!this.enabled) {
      return disabled(cmd.orderId);
    }

    const existing = this.existingBook(marketId);
    if (!existing) return positionFlatResult();
    const net = netPositionOf(existing, cmd.accountId);
    if (net === ZERO) return positionFlatResult();

    return this.submit(marketId, flattenCloseOrder(cmd, net), lifecycleProof);
  }

  /**
   * Halt new submits on one market. Cancels stay. Other markets stay open.
   * Operator id is required. The engine does not invent a caller or a duration.
   */
  async halt(marketId: MarketId, cmd: { readonly operatorId?: string | null }): Promise<MarketHaltResult> {
    return withEngineSpan('matching.halt', { marketId }, async () => {
      const operatorId = readOperatorId(cmd);
      if (operatorId === null) {
        return {
          accepted: false,
          marketId,
          halted: this.halted.has(marketId),
          operatorId: null,
          rejected: operatorRefuse(null)!,
        };
      }

      const at = this.clock().toISOString();
      this.journal.append({ kind: 'halt', marketId, at, operatorId });
      this.halted.add(marketId);
      return { accepted: true, marketId, halted: true, operatorId };
    });
  }

  /**
   * Resume submits on one market. Explicit door — halt never expires.
   * Operator id is required. The engine does not invent a caller or a duration.
   */
  async resume(marketId: MarketId, cmd: { readonly operatorId?: string | null }): Promise<MarketHaltResult> {
    return withEngineSpan('matching.resume', { marketId }, async () => {
      const operatorId = readOperatorId(cmd);
      if (operatorId === null) {
        return {
          accepted: false,
          marketId,
          halted: this.halted.has(marketId),
          operatorId: null,
          rejected: operatorRefuse(null)!,
        };
      }

      const at = this.clock().toISOString();
      this.journal.append({ kind: 'resume', marketId, at, operatorId });
      this.halted.delete(marketId);
      return { accepted: true, marketId, halted: false, operatorId };
    });
  }

  /**
   * Reduce-only on one market. Opens and increases refuse. Reduce/close/cancel stay.
   * Other markets stay open. Operator id is required. Not halt. No duration.
   */
  async reduceOnly(marketId: MarketId, cmd: { readonly operatorId?: string | null }): Promise<MarketReduceOnlyResult> {
    return withEngineSpan('matching.reduce_only', { marketId }, async () => {
      const operatorId = readOperatorId(cmd);
      if (operatorId === null) {
        return {
          accepted: false,
          marketId,
          reduceOnly: this.reduceOnlyMarkets.has(marketId),
          operatorId: null,
          rejected: operatorRefuse(null)!,
        };
      }

      const at = this.clock().toISOString();
      this.journal.append({ kind: 'reduce_only', marketId, at, operatorId });
      this.reduceOnlyMarkets.add(marketId);
      return { accepted: true, marketId, reduceOnly: true, operatorId };
    });
  }

  /**
   * Resume full submits on one reduce-only market. Explicit door — never expires.
   * Operator id is required. Does not clear halt. The engine does not invent a duration.
   */
  async resumeReduceOnly(marketId: MarketId, cmd: { readonly operatorId?: string | null }): Promise<MarketReduceOnlyResult> {
    return withEngineSpan('matching.resume_reduce_only', { marketId }, async () => {
      const operatorId = readOperatorId(cmd);
      if (operatorId === null) {
        return {
          accepted: false,
          marketId,
          reduceOnly: this.reduceOnlyMarkets.has(marketId),
          operatorId: null,
          rejected: operatorRefuse(null)!,
        };
      }

      const at = this.clock().toISOString();
      this.journal.append({ kind: 'resume_reduce_only', marketId, at, operatorId });
      this.reduceOnlyMarkets.delete(marketId);
      return { accepted: true, marketId, reduceOnly: false, operatorId };
    });
  }

  /**
   * Post-only on one market. Non-post-only submits refuse. Post-only that would take still refuses.
   * Cancels stay. Other markets stay open. Operator id is required. Not halt. No duration.
   */
  async postOnly(marketId: MarketId, cmd: { readonly operatorId?: string | null }): Promise<MarketPostOnlyResult> {
    return withEngineSpan('matching.post_only', { marketId }, async () => {
      const operatorId = readOperatorId(cmd);
      if (operatorId === null) {
        return {
          accepted: false,
          marketId,
          postOnly: this.postOnlyMarkets.has(marketId),
          operatorId: null,
          rejected: operatorRefuse(null)!,
        };
      }

      const at = this.clock().toISOString();
      this.journal.append({ kind: 'post_only', marketId, at, operatorId });
      this.postOnlyMarkets.add(marketId);
      return { accepted: true, marketId, postOnly: true, operatorId };
    });
  }

  /**
   * Resume full submits on one post-only market. Explicit door — never expires.
   * Operator id is required. Does not clear halt. The engine does not invent a duration.
   */
  async resumePostOnly(marketId: MarketId, cmd: { readonly operatorId?: string | null }): Promise<MarketPostOnlyResult> {
    return withEngineSpan('matching.resume_post_only', { marketId }, async () => {
      const operatorId = readOperatorId(cmd);
      if (operatorId === null) {
        return {
          accepted: false,
          marketId,
          postOnly: this.postOnlyMarkets.has(marketId),
          operatorId: null,
          rejected: operatorRefuse(null)!,
        };
      }

      const at = this.clock().toISOString();
      this.journal.append({ kind: 'resume_post_only', marketId, at, operatorId });
      this.postOnlyMarkets.delete(marketId);
      return { accepted: true, marketId, postOnly: false, operatorId };
    });
  }

  private eventsForSubmit(marketId: MarketId, orderId: OrderId, result: SubmitResult, at: string): PendingEvent[] {
    const events: PendingEvent[] = [];

    if (result.accepted && result.sequence !== null) {
      events.push({
        sequence: result.sequence,
        name: 'orderAccepted',
        payload: { orderId, marketId, sequence: result.sequence },
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

  private eventsForAmend(marketId: MarketId, result: AmendResult, at: string): PendingEvent[] {
    if (!result.accepted) return [];
    const events: PendingEvent[] = [];
    for (const fill of result.fills) events.push(filledEvent(marketId, fill, at));
    for (const cancellation of result.cancellations) events.push(cancelledEvent(marketId, cancellation));
    for (const triggered of result.triggered as readonly TriggerOutcome[]) {
      for (const fill of triggered.fills) events.push(filledEvent(marketId, fill, at));
      for (const cancellation of triggered.cancellations) events.push(cancelledEvent(marketId, cancellation));
    }
    return events.sort((a, b) => a.sequence - b.sequence);
  }

  private async emit(events: readonly PendingEvent[]): Promise<void> {
    for (const event of events) {
      const opts = { idempotencyKey: event.key };
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

function filledEvent(marketId: MarketId, fill: Fill, at: string): PendingEvent {
  return {
    sequence: fill.sequence,
    name: 'orderFilled',
    payload: {
      marketId,
      makerOrderId: fill.makerOrderId,
      takerOrderId: fill.takerOrderId,
      price: formatAmount(fill.price),
      qty: formatAmount(fill.qty),
      sequence: fill.sequence,
      ts: at,
      makerAccountId: fill.makerAccountId,
      takerAccountId: fill.takerAccountId,
    },
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

function disabledAmend(orderId: OrderId): AmendResult {
  return {
    accepted: false,
    orderId,
    sequence: null,
    version: null,
    priority: null,
    fills: [],
    resting: null,
    rejected: { code: 'engine_disabled', message: `matching engine is disabled — order ${orderId} not processed` },
    cancellations: [],
    triggered: [],
  };
}
