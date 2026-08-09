import { ZERO, formatAmount, min, parseAmount, type Amount } from '@intafaced/ledger-client/money';
import type {
  AccountId,
  BookState,
  CancelResult,
  CancelledRef,
  EngineOrder,
  Fill,
  MarketId,
  OrderId,
  OrderSide,
  PriceLevelState,
  RejectReason,
  RestingRef,
  SubmitResult,
  TimeInForce,
  TriggerOutcome,
} from './types.js';

/**
 * THE ORDER BOOK (§5.1).
 *
 * "In-memory books per market: price-time priority, limit/market/stop,
 *  post-only, IOC/FOK … Deterministic, event-sourced, replayable."
 *
 * This file is pure. No I/O, no async, no clock, no randomness, and nothing
 * that iterates an unordered collection in a way that reaches the output. That
 * is not stylistic: §5.4 requires that replaying the journal twice produces
 * byte-identical state, and every one of those would break it.
 *
 * Specifically forbidden in here, forever:
 *   - `Date.now()` / `new Date()` — time enters via the journal, never the book
 *   - `Math.random()` / `crypto.randomUUID()` — ids come from the caller
 *   - a JS `number` holding a price or a quantity — prices and quantities are
 *     `Amount`, the scaled bigint from `@intafaced/ledger-client`
 *
 * The only `number` in the whole file is `sequence`, a monotonic counter.
 */

interface RestingOrder {
  readonly orderId: OrderId;
  readonly accountId: AccountId;
  readonly side: OrderSide;
  readonly price: Amount;
  remaining: Amount;
  /** Acceptance sequence — the "time" in price-time priority. */
  readonly sequence: number;
}

interface PriceLevel {
  readonly price: Amount;
  /** FIFO. Index 0 is the oldest order at this price and fills first. */
  readonly orders: RestingOrder[];
}

interface StopOrder {
  readonly orderId: OrderId;
  readonly accountId: AccountId;
  readonly type: 'stop' | 'stop_limit';
  readonly side: OrderSide;
  readonly qty: Amount;
  readonly price: Amount | null;
  readonly stopPrice: Amount;
  readonly tif: TimeInForce;
  readonly sequence: number;
}

/**
 * An order reduced to what matching actually needs. A triggered stop becomes
 * one of these too, which is why activation and submission share a code path
 * instead of two implementations that drift apart.
 */
interface EffectiveOrder {
  readonly orderId: OrderId;
  readonly accountId: AccountId;
  readonly side: OrderSide;
  readonly qty: Amount;
  /** null means "market" — take whatever the book offers. */
  readonly price: Amount | null;
  readonly tif: TimeInForce;
}

interface MatchOutcome {
  readonly fills: Fill[];
  readonly remaining: Amount;
  readonly cancellations: CancelledRef[];
}

/**
 * Self-trade prevention policy: CANCEL-OLDEST.
 *
 * When an aggressor meets its own resting order, the resting order is pulled
 * and matching continues past it. The alternative — cancelling the incoming
 * remainder — lets an account wedge its own access to the book behind a stale
 * quote it has forgotten about. Cancel-oldest keeps the aggressor's intent and
 * costs the account only the order it had already decided to replace.
 *
 * Either way the invariant §5.1 cares about holds: no account is ever both
 * maker and taker of the same fill.
 */
export const SELF_TRADE_PREVENTION = 'cancel-oldest' as const;

function reject(code: RejectReason['code'], message: string): RejectReason {
  return { code, message };
}

export class OrderBook {
  readonly marketId: MarketId;

  private sequence = 0;
  /** Descending by price: index 0 is the best bid. */
  private readonly bids: PriceLevel[] = [];
  /** Ascending by price: index 0 is the best ask. */
  private readonly asks: PriceLevel[] = [];
  /** Acceptance order. `drainStops` scans it front-to-back, so this ordering is the trigger priority. */
  private readonly stops: StopOrder[] = [];
  private readonly index = new Map<OrderId, RestingOrder>();
  private lastTradePrice: Amount | null = null;

  /**
   * MEMOISED DEPTH — see `depth()` for the correctness argument.
   *
   * Derived state, not book state. `toState`/`fromState` ignore it on purpose:
   * a snapshot carrying a cache could restore a book whose cache disagreed with
   * its own orders, which is the one failure this must not be able to have.
   */
  private depthCache: { sequence: number; limit: number; bids: Array<[string, string]>; asks: Array<[string, string]> } | null = null;

  constructor(marketId: MarketId) {
    this.marketId = marketId;
  }

  // ── Read surface ──────────────────────────────────────────────────────────

  get currentSequence(): number {
    return this.sequence;
  }

  get lastPrice(): Amount | null {
    return this.lastTradePrice;
  }

  bestBid(): Amount | null {
    return this.bids[0]?.price ?? null;
  }

  bestAsk(): Amount | null {
    return this.asks[0]?.price ?? null;
  }

  /**
   * Aggregated depth, CCXT level shape: `[price, amount]` decimal-string tuples.
   *
   * ── WHY THIS IS MEMOISED ────────────────────────────────────────────────
   *
   * Measured (`pnpm perf:book`, 10k-deep book): depth was ~21k ops/s at p50
   * 44.8us against ~628k ops/s at p50 0.90us for a submit — fifty times the
   * cost of the write path. And svc-ws re-broadcasts depth on a loop, so the
   * read that runs most often was by far the most expensive thing the engine
   * did. The cost is not the summing; it is `formatAmount`, called 2x`limit`
   * times per call, each one a BigInt divide, a pad and a regex.
   *
   * ── WHY KEYED ON `sequence`, AND WHY THAT IS SOUND ──────────────────────
   *
   * `this.sequence` strictly increases on every operation that can change what
   * depth would report, and there is no mutating path that does not consume one:
   *
   *   · `submit`  — `nextSequence()` before `execute`, which is what fills,
   *                 rests and removes levels.
   *   · `cancel`  — `removeResting` then `nextSequence()`.
   *   · stops     — `drainStops` takes a sequence per trigger, and a trigger
   *                 executes through the same path.
   *   · restore   — `fromState` builds a NEW OrderBook, so it starts with an
   *                 empty cache rather than inheriting a stale one.
   *
   * Rejections (`validate`, PO/FOK viability) return BEFORE `nextSequence`,
   * and that is exactly right: a rejected order leaves the book untouched, so
   * the previous depth answer is still the correct one.
   *
   * So equal `sequence` means an unchanged book, and the cached answer is not
   * an approximation of the current one — it IS the current one.
   *
   * ── WHY NOT A RUNNING PER-LEVEL TOTAL ───────────────────────────────────
   *
   * That was the faster option and it was rejected. It needs maintaining at
   * seven mutation sites, including the in-place `remaining` decrement inside a
   * partial fill. A total that drifts at any one of them reports WRONG DEPTH
   * to every caller, and nothing in the suite would notice: `toState` folds
   * from `orders`, not from a cached total, so journal-replay determinism would
   * stay byte-identical while the market data lied. One cache with one
   * invalidation rule can be reasoned about; seven hooks cannot.
   *
   * ── SHARING ─────────────────────────────────────────────────────────────
   *
   * The outer arrays are fresh on every call. The `[price, amount]` tuples are
   * shared with the cache and must be treated as read-only — every caller
   * serialises them, none mutates them.
   */
  depth(limit = 50): { bids: Array<[string, string]>; asks: Array<[string, string]>; sequence: number } {
    const cached = this.depthCache;
    if (cached !== null && cached.sequence === this.sequence && cached.limit === limit) {
      return { bids: [...cached.bids], asks: [...cached.asks], sequence: this.sequence };
    }

    const fold = (levels: readonly PriceLevel[]): Array<[string, string]> =>
      levels.slice(0, limit).map((level) => {
        let total = ZERO;
        for (const order of level.orders) total += order.remaining;
        return [formatAmount(level.price), formatAmount(total)];
      });

    const bids = fold(this.bids);
    const asks = fold(this.asks);
    this.depthCache = { sequence: this.sequence, limit, bids, asks };

    return { bids: [...bids], asks: [...asks], sequence: this.sequence };
  }

  // ── Write surface ─────────────────────────────────────────────────────────

  /**
   * Submit an order.
   *
   * Deterministic by construction: every branch below reads only the book's own
   * state and the order, and every sequence number comes from one counter.
   */
  submit(order: EngineOrder): SubmitResult {
    const structural = this.validate(order);
    if (structural) return rejected(structural);

    // A stop that has not triggered yet never reaches the matcher, so its
    // PO/FOK viability is checked at activation instead — the book it will meet
    // is not the book it was submitted against.
    const isStop = order.type === 'stop' || order.type === 'stop_limit';
    const triggersNow = isStop && this.isTriggered(order.side, order.stopPrice as Amount);

    if (isStop && !triggersNow) {
      const sequence = this.nextSequence();
      this.stops.push({
        orderId: order.orderId,
        accountId: order.accountId,
        type: order.type as 'stop' | 'stop_limit',
        side: order.side,
        qty: order.qty,
        price: order.price,
        stopPrice: order.stopPrice as Amount,
        tif: order.tif,
        sequence,
      });
      return {
        accepted: true,
        sequence,
        fills: [],
        resting: {
          kind: 'stop',
          orderId: order.orderId,
          accountId: order.accountId,
          side: order.side,
          price: order.stopPrice as Amount,
          remaining: order.qty,
          sequence,
        },
        cancellations: [],
        triggered: [],
      };
    }

    const effective = toEffective(order);

    // PO and FOK are decided BEFORE a sequence is consumed, because both are
    // rejections and a rejected order must leave the book — including its
    // counter — exactly as it found it.
    const viability = this.checkViability(effective);
    if (viability) return rejected(viability);

    const sequence = this.nextSequence();
    const outcome = this.execute(effective, sequence);
    this.recordPrints(outcome.fills);

    return {
      accepted: true,
      sequence,
      fills: outcome.fills,
      resting: outcome.resting,
      cancellations: outcome.cancellations,
      triggered: this.drainStops(),
    };
  }

  /** Pull an order from the limit book or the stop book. Unknown ids are a no-op, not an error — cancels race fills. */
  cancel(orderId: OrderId): CancelResult {
    const resting = this.index.get(orderId);
    if (resting) {
      this.removeResting(resting);
      const sequence = this.nextSequence();
      return {
        cancelled: true,
        orderId,
        sequence,
        cancellation: {
          orderId,
          accountId: resting.accountId,
          remainingQty: resting.remaining,
          sequence,
          reason: 'requested',
        },
      };
    }

    const stopIndex = this.stops.findIndex((s) => s.orderId === orderId);
    if (stopIndex !== -1) {
      const stop = this.stops.splice(stopIndex, 1)[0] as StopOrder;
      const sequence = this.nextSequence();
      return {
        cancelled: true,
        orderId,
        sequence,
        cancellation: { orderId, accountId: stop.accountId, remainingQty: stop.qty, sequence, reason: 'requested' },
      };
    }

    return { cancelled: false, orderId, sequence: null, cancellation: null };
  }

  // ── Validation ────────────────────────────────────────────────────────────

  private validate(order: EngineOrder): RejectReason | null {
    if (order.qty <= ZERO) return reject('invalid_qty', 'quantity must be strictly positive');
    if (this.index.has(order.orderId) || this.stops.some((s) => s.orderId === order.orderId)) {
      // Bots retry. A retry that opens a second position is the worst bug this
      // service could have, so the id is the guard rather than a hope.
      return reject('duplicate_order_id', `order ${order.orderId} is already live in ${this.marketId}`);
    }

    const needsPrice = order.type === 'limit' || order.type === 'stop_limit';
    if (needsPrice) {
      if (order.price === null) return reject('missing_price', `a ${order.type} order requires a price`);
      if (order.price <= ZERO) return reject('invalid_price', 'price must be strictly positive');
    } else if (order.price !== null) {
      return reject('unexpected_price', `a ${order.type} order must not carry a limit price`);
    }

    const needsStop = order.type === 'stop' || order.type === 'stop_limit';
    if (needsStop) {
      if (order.stopPrice === null) return reject('missing_stop_price', `a ${order.type} order requires a stopPrice`);
      if (order.stopPrice <= ZERO) return reject('invalid_price', 'stopPrice must be strictly positive');
    } else if (order.stopPrice !== null) {
      return reject('unexpected_stop_price', `a ${order.type} order must not carry a stopPrice`);
    }

    // Post-only is a promise to be a maker. An order that cannot rest cannot
    // make that promise, so the combination is refused rather than reinterpreted.
    if (order.tif === 'PO' && !needsPrice) {
      return reject('invalid_tif', 'post-only requires a limit price');
    }

    return null;
  }

  /**
   * Book-state-dependent rejections. Non-mutating on purpose: FOK must be able
   * to ask "would this fill completely?" without half-filling to find out.
   */
  private checkViability(order: EffectiveOrder): RejectReason | null {
    if (order.tif === 'PO' && order.price !== null && this.wouldCross(order.side, order.price)) {
      return reject('post_only_would_cross', 'post-only order would take liquidity');
    }

    if (order.tif === 'FOK' && this.fillableQty(order.side, order.price, order.accountId) < order.qty) {
      // §5.1: fill-or-kill is all or nothing. No partial, not even one unit.
      return reject('fok_unfillable', 'fill-or-kill order cannot be filled in full');
    }

    return null;
  }

  private wouldCross(side: OrderSide, price: Amount): boolean {
    if (side === 'buy') {
      const ask = this.bestAsk();
      return ask !== null && price >= ask;
    }
    const bid = this.bestBid();
    return bid !== null && price <= bid;
  }

  /**
   * How much of the opposing book this account could actually take.
   *
   * Its own resting orders are excluded: self-trade prevention will pull them
   * rather than fill against them, so counting them would let a FOK order pass
   * a check it cannot satisfy.
   */
  private fillableQty(side: OrderSide, limitPrice: Amount | null, accountId: AccountId): Amount {
    let total = ZERO;
    for (const level of side === 'buy' ? this.asks : this.bids) {
      if (limitPrice !== null && !crossesLevel(side, limitPrice, level.price)) break;
      for (const order of level.orders) {
        if (order.accountId === accountId) continue;
        total += order.remaining;
      }
    }
    return total;
  }

  // ── Matching ──────────────────────────────────────────────────────────────

  private execute(order: EffectiveOrder, sequence: number): { fills: Fill[]; resting: RestingRef | null; cancellations: CancelledRef[] } {
    const matched = this.match(order);
    const cancellations = matched.cancellations;
    let resting: RestingRef | null = null;

    if (matched.remaining > ZERO) {
      const canRest = order.price !== null && (order.tif === 'GTC' || order.tif === 'PO');
      if (canRest) {
        resting = this.rest(order, matched.remaining, sequence);
      } else {
        cancellations.push({
          orderId: order.orderId,
          accountId: order.accountId,
          remainingQty: matched.remaining,
          sequence: this.nextSequence(),
          // A market order can never rest, whatever TIF it carried; an IOC limit
          // chose not to. svc-trade releases the hold identically for both, but
          // the reason is what a support ticket is answered with.
          reason: order.price === null ? 'market_remainder' : 'ioc_remainder',
        });
      }
    }

    return { fills: matched.fills, resting, cancellations };
  }

  /**
   * Walk the opposing book best-price-first, FIFO within a price level.
   *
   * This is price-time priority in five lines, and everything else in the file
   * exists to keep those five lines honest.
   */
  private match(order: EffectiveOrder): MatchOutcome {
    const opposite = order.side === 'buy' ? this.asks : this.bids;
    const fills: Fill[] = [];
    const cancellations: CancelledRef[] = [];
    let remaining = order.qty;

    while (remaining > ZERO && opposite.length > 0) {
      const level = opposite[0] as PriceLevel;
      if (order.price !== null && !crossesLevel(order.side, order.price, level.price)) break;

      while (remaining > ZERO && level.orders.length > 0) {
        const maker = level.orders[0] as RestingOrder;

        if (maker.accountId === order.accountId) {
          level.orders.shift();
          this.index.delete(maker.orderId);
          cancellations.push({
            orderId: maker.orderId,
            accountId: maker.accountId,
            remainingQty: maker.remaining,
            sequence: this.nextSequence(),
            reason: 'self_trade_prevention',
          });
          continue;
        }

        const qty = min(remaining, maker.remaining);
        fills.push({
          sequence: this.nextSequence(),
          makerOrderId: maker.orderId,
          makerAccountId: maker.accountId,
          takerOrderId: order.orderId,
          takerAccountId: order.accountId,
          takerSide: order.side,
          // The maker's price, always. The taker crossed the spread; it does not
          // also get to set the price it crossed to.
          price: maker.price,
          qty,
        });

        maker.remaining -= qty;
        remaining -= qty;

        if (maker.remaining === ZERO) {
          level.orders.shift();
          this.index.delete(maker.orderId);
        }
      }

      // A level that emptied exactly leaves the book here, not on the next pass:
      // an empty level must never be observable as the best price.
      if (level.orders.length === 0) opposite.shift();
    }

    return { fills, remaining, cancellations };
  }

  private rest(order: EffectiveOrder, remaining: Amount, sequence: number): RestingRef {
    const price = order.price as Amount;
    const resting: RestingOrder = {
      orderId: order.orderId,
      accountId: order.accountId,
      side: order.side,
      price,
      remaining,
      sequence,
    };

    const levels = order.side === 'buy' ? this.bids : this.asks;
    const { position, found } = locate(levels, price, order.side === 'buy');
    if (found) (levels[position] as PriceLevel).orders.push(resting);
    else levels.splice(position, 0, { price, orders: [resting] });

    this.index.set(order.orderId, resting);
    return { kind: 'book', orderId: resting.orderId, accountId: resting.accountId, side: resting.side, price, remaining, sequence };
  }

  private removeResting(resting: RestingOrder): void {
    const levels = resting.side === 'buy' ? this.bids : this.asks;
    const { position, found } = locate(levels, resting.price, resting.side === 'buy');
    if (!found) return;

    const level = levels[position] as PriceLevel;
    const at = level.orders.indexOf(resting);
    if (at !== -1) level.orders.splice(at, 1);
    if (level.orders.length === 0) levels.splice(position, 1);
    this.index.delete(resting.orderId);
  }

  // ── Stops ─────────────────────────────────────────────────────────────────

  private recordPrints(fills: readonly Fill[]): void {
    const last = fills[fills.length - 1];
    if (last) this.lastTradePrice = last.price;
  }

  /** A buy stop fires when the market trades up to it; a sell stop when it trades down to it. */
  private isTriggered(side: OrderSide, stopPrice: Amount): boolean {
    if (this.lastTradePrice === null) return false;
    return side === 'buy' ? this.lastTradePrice >= stopPrice : this.lastTradePrice <= stopPrice;
  }

  /**
   * Fire every stop the latest prints armed, cascading.
   *
   * Terminates because each pass removes exactly one order from `this.stops`
   * and nothing in the loop puts one back. Order is by acceptance sequence:
   * the oldest armed stop goes first, which is the same tie-break the limit
   * book uses.
   */
  private drainStops(): TriggerOutcome[] {
    const outcomes: TriggerOutcome[] = [];

    for (;;) {
      const at = this.stops.findIndex((s) => this.isTriggered(s.side, s.stopPrice));
      if (at === -1) break;
      const stop = this.stops.splice(at, 1)[0] as StopOrder;
      outcomes.push(this.activate(stop));
    }

    return outcomes;
  }

  private activate(stop: StopOrder): TriggerOutcome {
    const effective: EffectiveOrder = {
      orderId: stop.orderId,
      accountId: stop.accountId,
      side: stop.side,
      qty: stop.qty,
      // A stop-market becomes a market order; a stop-limit becomes its limit.
      price: stop.type === 'stop_limit' ? stop.price : null,
      tif: stop.tif,
    };

    // Viability BEFORE a sequence is taken — same rule as submit(). A pure
    // structural reject must not invent two sequences for a path that never
    // filled or rested. The stop was already pulled from the stop book, so the
    // cancel still needs one sequence (depth memo keys on sequence; removing a
    // stop is a real mutation), and that single sequence is both the outcome
    // sequence and the cancellation sequence.
    const viability = this.checkViability(effective);
    if (viability) {
      const sequence = this.nextSequence();
      return {
        orderId: stop.orderId,
        sequence,
        fills: [],
        resting: null,
        cancellations: [
          {
            orderId: stop.orderId,
            accountId: stop.accountId,
            remainingQty: stop.qty,
            sequence,
            reason: 'trigger_rejected',
          },
        ],
        rejected: viability,
      };
    }

    const sequence = this.nextSequence();
    const outcome = this.execute(effective, sequence);
    // Prints from a triggered stop arm the next one — that is the cascade.
    this.recordPrints(outcome.fills);
    return { orderId: stop.orderId, sequence, fills: outcome.fills, resting: outcome.resting, cancellations: outcome.cancellations };
  }

  private nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  // ── Serialisation (§5.4) ──────────────────────────────────────────────────

  /**
   * The whole book as plain data. Every amount is a decimal string.
   *
   * Key order is fixed by these object literals, so `JSON.stringify` of two
   * equal books is byte-identical — which is exactly what §5.4's determinism
   * test compares.
   */
  toState(): BookState {
    const foldLevels = (levels: readonly PriceLevel[]): PriceLevelState[] =>
      levels.map((level) => ({
        price: formatAmount(level.price),
        orders: level.orders.map((o) => ({
          orderId: o.orderId,
          accountId: o.accountId,
          remaining: formatAmount(o.remaining),
          sequence: o.sequence,
        })),
      }));

    return {
      marketId: this.marketId,
      sequence: this.sequence,
      lastTradePrice: this.lastTradePrice === null ? null : formatAmount(this.lastTradePrice),
      bids: foldLevels(this.bids),
      asks: foldLevels(this.asks),
      stops: this.stops.map((s) => ({
        orderId: s.orderId,
        accountId: s.accountId,
        type: s.type,
        side: s.side,
        qty: formatAmount(s.qty),
        price: s.price === null ? null : formatAmount(s.price),
        stopPrice: formatAmount(s.stopPrice),
        tif: s.tif,
        sequence: s.sequence,
      })),
    };
  }

  serialize(): string {
    return JSON.stringify(this.toState());
  }

  /** Rebuild a book from a snapshot. The inverse of `toState`, unit for unit. */
  static fromState(state: BookState): OrderBook {
    const book = new OrderBook(state.marketId);
    book.sequence = state.sequence;
    book.lastTradePrice = state.lastTradePrice === null ? null : parseAmount(state.lastTradePrice);

    const hydrate = (levels: readonly PriceLevelState[], side: OrderSide, target: PriceLevel[]): void => {
      for (const level of levels) {
        const price = parseAmount(level.price);
        const orders = level.orders.map<RestingOrder>((o) => ({
          orderId: o.orderId,
          accountId: o.accountId,
          side,
          price,
          remaining: parseAmount(o.remaining),
          sequence: o.sequence,
        }));
        for (const o of orders) book.index.set(o.orderId, o);
        target.push({ price, orders });
      }
    };

    hydrate(state.bids, 'buy', book.bids);
    hydrate(state.asks, 'sell', book.asks);

    for (const s of state.stops) {
      book.stops.push({
        orderId: s.orderId,
        accountId: s.accountId,
        type: s.type as 'stop' | 'stop_limit',
        side: s.side,
        qty: parseAmount(s.qty),
        price: s.price === null ? null : parseAmount(s.price),
        stopPrice: parseAmount(s.stopPrice),
        tif: s.tif,
        sequence: s.sequence,
      });
    }

    return book;
  }
}

// ── Free functions ──────────────────────────────────────────────────────────

function rejected(reason: RejectReason): SubmitResult {
  return { accepted: false, sequence: null, fills: [], resting: null, rejected: reason, cancellations: [], triggered: [] };
}

function toEffective(order: EngineOrder): EffectiveOrder {
  return {
    orderId: order.orderId,
    accountId: order.accountId,
    side: order.side,
    qty: order.qty,
    price: order.type === 'limit' || order.type === 'stop_limit' ? order.price : null,
    tif: order.tif,
  };
}

/** Would an aggressor at `limitPrice` accept a resting order at `levelPrice`? */
function crossesLevel(side: OrderSide, limitPrice: Amount, levelPrice: Amount): boolean {
  return side === 'buy' ? levelPrice <= limitPrice : levelPrice >= limitPrice;
}

/**
 * Binary search over the sorted level array.
 *
 * Levels are kept in an array rather than a Map because iteration order over a
 * Map is insertion order, not price order — and a book whose "best price"
 * depends on what was inserted first is not a book (§5.4).
 */
function locate(levels: readonly PriceLevel[], price: Amount, descending: boolean): { position: number; found: boolean } {
  let lo = 0;
  let hi = levels.length;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const p = (levels[mid] as PriceLevel).price;
    if (p === price) return { position: mid, found: true };
    if (descending ? p > price : p < price) lo = mid + 1;
    else hi = mid;
  }

  return { position: lo, found: false };
}
