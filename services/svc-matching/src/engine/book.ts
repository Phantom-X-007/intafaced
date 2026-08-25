import { ZERO, formatAmount, min, parseAmount, type Amount } from '@intafaced/ledger-client/money';
import type {
  AccountId,
  AmendResult,
  BookState,
  CancelResult,
  CancelledRef,
  EngineAmend,
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
  /** Instruction version. Bumps on amend; queue `sequence` does not have to. */
  version: number;
  ocoSiblingId: OrderId | null;
  expireAt: string | null;
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
  qty: Amount;
  readonly price: Amount | null;
  readonly stopPrice: Amount;
  readonly tif: TimeInForce;
  readonly sequence: number;
  version: number;
  ocoSiblingId: OrderId | null;
  expireAt: string | null;
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
  readonly ocoSiblingId: OrderId | null;
  readonly expireAt: string | null;
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
  /** Order ids that joined an OCO pair. A named sibling that has left is terminal. */
  private readonly ocoMembers = new Set<OrderId>();
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

  // ── Read surface ──────────────────────────────────────

  get currentSequence(): number {
    return this.sequence;
  }

  get lastPrice(): Amount | null {
    return this.lastTradePrice;
  }

  /**
   * Never printed and holding nothing. Sequence can still be > 0: an IOC or
   * market remainder on a virgin book consumes a sequence without a print or a
   * rest. That must not list as a market — same honesty as a FOK reject.
   */
  get isNeverPrintedEmpty(): boolean {
    return this.lastTradePrice === null && this.index.size === 0 && this.stops.length === 0;
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
   * ── WHY THIS IS MEMOISED ────────────────────────────────
   *
   * Measured (`pnpm perf:book`, 10k-deep book): depth was ~21k ops/s at p50
   * 44.8us against ~628k ops/s at p50 0.90us for a submit — fifty times the
   * cost of the write path. And svc-ws re-broadcasts depth on a loop, so the
   * read that runs most often was by far the most expensive thing the engine
   * did. The cost is not the summing; it is `formatAmount`, called 2x`limit`
   * times per call, each one a BigInt divide, a pad and a regex.
   *
   * ── WHY KEYED ON `sequence`, AND WHY THAT IS SOUND ──────────────
   *
   * `this.sequence` strictly increases on every operation that can change what
   * depth would report, and there is no mutating path that does not consume one:
   *
   *   · `submit`  — `nextSequence()` before `execute`, which is what fills,
   *                 rests and removes levels.
   *   · `cancel`  — `removeResting` then `nextSequence()`.
   *   · `amend`   — retain-priority still consumes one (remaining changed);
   *                 lose-priority re-executes through the same path as submit.
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
   * ── WHY NOT A RUNNING PER-LEVEL TOTAL ───────────────────────
   *
   * That was the faster option and it was rejected. It needs maintaining at
   * seven mutation sites, including the in-place `remaining` decrement inside a
   * partial fill. A total that drifts at any one of them reports WRONG DEPTH
   * to every caller, and nothing in the suite would notice: `toState` folds
   * from `orders`, not from a cached total, so journal-replay determinism would
   * stay byte-identical while the market data lied. One cache with one
   * invalidation rule can be reasoned about; seven hooks cannot.
   *
   * ── SHARING ───────────────────────────────────────
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

  // ── Write surface ─────────────────────────────────────

  /**
   * Submit an order.
   *
   * Deterministic by construction: every branch below reads only the book's own
   * state and the order, and every sequence number comes from one counter.
   */
  submit(order: EngineOrder, now?: Date | null): SubmitResult {
    const structural = this.validate(order, now);
    if (structural) return rejected(structural);
    const expired = now != null ? this.expireDue(now) : [];

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
        version: 1,
        ocoSiblingId: order.ocoSiblingId ?? null,
        expireAt: order.expireAt ?? null,
      });
      this.rememberOco(order);
      this.linkLiveSibling(order.orderId, order.ocoSiblingId ?? null);
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
          version: 1,
        },
        cancellations: expired,
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
    this.rememberOco(order);
    this.linkLiveSibling(order.orderId, order.ocoSiblingId ?? null);
    const ocoCancels = this.cancelOcoSiblings(outcome.fills, order);

    return {
      accepted: true,
      sequence,
      fills: outcome.fills,
      resting: outcome.resting,
      cancellations: [...expired, ...outcome.cancellations, ...ocoCancels],
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

  /**
   * Native amend (PX-S03 §8.2). One command against an expected instruction
   * version. Qty-down at the same price keeps the original queue sequence;
   * qty-up, price change, stop-price change, or a TIF that re-executes loses
   * it. A refuse does not pull the order.
   */
  amend(cmd: EngineAmend): AmendResult {
    const resting = this.index.get(cmd.orderId);
    if (resting) return this.amendResting(resting, cmd);

    const stop = this.stops.find((s) => s.orderId === cmd.orderId);
    if (stop) return this.amendStop(stop, cmd);

    return refusedAmend(cmd.orderId, reject('order_not_found', `order ${cmd.orderId} is not live in ${this.marketId}`));
  }

  private amendResting(resting: RestingOrder, cmd: EngineAmend): AmendResult {
    if (cmd.expectedVersion !== resting.version) {
      return refusedAmend(cmd.orderId, reject('version_mismatch', `order ${cmd.orderId} is at version ${resting.version}`));
    }
    if (cmd.stopPrice !== undefined) {
      return refusedAmend(cmd.orderId, reject('unexpected_stop_price', 'a resting limit order must not carry a stopPrice'));
    }

    const qty = cmd.qty ?? resting.remaining;
    const price = cmd.price ?? resting.price;
    if (qty <= ZERO) return refusedAmend(cmd.orderId, reject('invalid_qty', 'quantity must be strictly positive'));
    if (price <= ZERO) return refusedAmend(cmd.orderId, reject('invalid_price', 'price must be strictly positive'));

    const tif: TimeInForce = cmd.tif ?? 'GTC';
    const tifForcesReexecute = tif === 'IOC' || tif === 'FOK';
    const retain = price === resting.price && !tifForcesReexecute && qty <= resting.remaining;

    if (retain) {
      resting.remaining = qty;
      resting.version += 1;
      this.nextSequence();
      return {
        accepted: true,
        orderId: resting.orderId,
        sequence: resting.sequence,
        version: resting.version,
        priority: 'retained',
        fills: [],
        resting: toRestingRef(resting),
        cancellations: [],
        triggered: [],
      };
    }

    const effective: EffectiveOrder = {
      orderId: resting.orderId,
      accountId: resting.accountId,
      side: resting.side,
      qty,
      price,
      tif,
      ocoSiblingId: resting.ocoSiblingId,
      expireAt: cmd.expireAt ?? resting.expireAt,
    };
    const viability = this.checkViability(effective);
    if (viability) return refusedAmend(cmd.orderId, viability);

    const nextVersion = resting.version + 1;
    this.removeResting(resting);
    const sequence = this.nextSequence();
    const outcome = this.execute(effective, sequence, nextVersion);
    this.recordPrints(outcome.fills);
    const ocoCancels = this.cancelOcoSiblings(outcome.fills, {
      orderId: resting.orderId,
      ocoSiblingId: resting.ocoSiblingId,
    });
    return {
      accepted: true,
      orderId: cmd.orderId,
      sequence: outcome.resting?.sequence ?? sequence,
      version: outcome.resting?.version ?? nextVersion,
      priority: 'lost',
      fills: outcome.fills,
      resting: outcome.resting,
      cancellations: [...outcome.cancellations, ...ocoCancels],
      triggered: this.drainStops(),
    };
  }

  private amendStop(stop: StopOrder, cmd: EngineAmend): AmendResult {
    if (cmd.expectedVersion !== stop.version) {
      return refusedAmend(cmd.orderId, reject('version_mismatch', `order ${cmd.orderId} is at version ${stop.version}`));
    }
    if (stop.type === 'stop' && cmd.price !== undefined) {
      return refusedAmend(cmd.orderId, reject('unexpected_price', 'a stop order must not carry a limit price'));
    }

    const qty = cmd.qty ?? stop.qty;
    const price = cmd.price !== undefined ? cmd.price : stop.price;
    const stopPrice = cmd.stopPrice ?? stop.stopPrice;
    const tif = cmd.tif ?? stop.tif;
    if (qty <= ZERO) return refusedAmend(cmd.orderId, reject('invalid_qty', 'quantity must be strictly positive'));
    if (stopPrice <= ZERO) return refusedAmend(cmd.orderId, reject('invalid_price', 'stopPrice must be strictly positive'));
    if (stop.type === 'stop_limit') {
      if (price === null) return refusedAmend(cmd.orderId, reject('missing_price', 'a stop_limit order requires a price'));
      if (price <= ZERO) return refusedAmend(cmd.orderId, reject('invalid_price', 'price must be strictly positive'));
    }

    const tifForcesReexecute = tif === 'IOC' || tif === 'FOK';
    const sameLimit = (price === null && stop.price === null) || (price !== null && stop.price !== null && price === stop.price);
    const retain = stopPrice === stop.stopPrice && sameLimit && tif === stop.tif && !tifForcesReexecute && qty <= stop.qty;

    if (retain) {
      stop.qty = qty;
      stop.version += 1;
      this.nextSequence();
      return {
        accepted: true,
        orderId: stop.orderId,
        sequence: stop.sequence,
        version: stop.version,
        priority: 'retained',
        fills: [],
        resting: {
          kind: 'stop',
          orderId: stop.orderId,
          accountId: stop.accountId,
          side: stop.side,
          price: stop.stopPrice,
          remaining: stop.qty,
          sequence: stop.sequence,
          version: stop.version,
        },
        cancellations: [],
        triggered: [],
      };
    }

    const updated: StopOrder = {
      ...stop,
      qty,
      price,
      stopPrice,
      tif,
      version: stop.version + 1,
      ocoSiblingId: stop.ocoSiblingId,
    };
    const effective: EffectiveOrder = {
      orderId: updated.orderId,
      accountId: updated.accountId,
      side: updated.side,
      qty: updated.qty,
      price: updated.type === 'stop_limit' ? updated.price : null,
      tif: updated.tif,
      ocoSiblingId: updated.ocoSiblingId,
      expireAt: cmd.expireAt ?? updated.expireAt,
    };

    if (this.isTriggered(updated.side, updated.stopPrice)) {
      const viability = this.checkViability(effective);
      if (viability) return refusedAmend(cmd.orderId, viability);
      const at = this.stops.findIndex((s) => s.orderId === stop.orderId);
      if (at !== -1) this.stops.splice(at, 1);
      const triggered = this.activate(updated);
      return {
        accepted: true,
        orderId: cmd.orderId,
        sequence: triggered.resting?.sequence ?? triggered.sequence,
        version: triggered.resting?.version ?? updated.version,
        priority: 'lost',
        fills: triggered.fills,
        resting: triggered.resting,
        cancellations: triggered.cancellations,
        triggered: [triggered, ...this.drainStops()],
        rejected: triggered.rejected,
      };
    }

    const at = this.stops.findIndex((s) => s.orderId === stop.orderId);
    if (at !== -1) this.stops.splice(at, 1);
    const sequence = this.nextSequence();
    const lost: StopOrder = { ...updated, sequence };
    this.stops.push(lost);
    return {
      accepted: true,
      orderId: lost.orderId,
      sequence: lost.sequence,
      version: lost.version,
      priority: 'lost',
      fills: [],
      resting: {
        kind: 'stop',
        orderId: lost.orderId,
        accountId: lost.accountId,
        side: lost.side,
        price: lost.stopPrice,
        remaining: lost.qty,
        sequence: lost.sequence,
        version: lost.version,
      },
      cancellations: [],
      triggered: [],
    };
  }

  // ── Validation ──────────────────────────────────────

  private validate(order: EngineOrder, now?: Date | null): RejectReason | null {
    if (order.qty <= ZERO) return reject('invalid_qty', 'quantity must be strictly positive');
    if (this.index.has(order.orderId) || this.stops.some((s) => s.orderId === order.orderId)) {
      // Bots retry. A retry that opens a second position is the worst bug this
      // service could have, so the id is the guard rather than a hope.
      return reject('duplicate_order_id', `order ${order.orderId} is already live in ${this.marketId}`);
    }

    const sibling = order.ocoSiblingId ?? null;
    if (sibling !== null) {
      if (sibling === order.orderId || sibling.length === 0) {
        return reject('invalid_oco_sibling', 'an OCO order cannot name itself as its sibling');
      }
      if (this.isOcoTerminal(sibling)) {
        return reject('oco_sibling_terminal', `oco sibling ${sibling} is already terminal`);
      }
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

    if (order.tif === 'GTD' || order.tif === 'GTT') {
      if (order.type === 'market') {
        return reject('invalid_tif', 'GTD/GTT cannot rest a market order');
      }
      const expireAt = order.expireAt ?? '';
      if (expireAt.length === 0) {
        return reject('missing_expire_at', 'GTD/GTT requires expireAt; the engine does not invent one');
      }
      const expireMs = Date.parse(expireAt);
      if (!Number.isFinite(expireMs)) {
        return reject('missing_expire_at', 'expireAt must be an ISO instant; the engine does not invent one');
      }
      if (now == null) {
        return reject('engine_clock_missing', 'rate-limited');
      }
      if (expireMs <= now.getTime()) {
        return reject('already_expired', 'expireAt is not after the engine clock');
      }
    }

    return null;
  }
