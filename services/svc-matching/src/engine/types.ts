import type { z } from 'zod';
import type { orderSideSchema, orderTypeSchema, timeInForceSchema } from '@intafaced/exchange-contract';
import type { Amount } from '@intafaced/ledger-client/money';

/**
 * Engine vocabulary (§5.1).
 *
 * Sides, order types and time-in-force are NOT redeclared here — they are
 * derived from `@intafaced/exchange-contract`, which is the published shape
 * every bot already speaks. A divergence between what the API accepts and what
 * the engine matches is the kind of bug that only shows up in production, so
 * the type system is made to forbid it.
 */

export type OrderSide = z.infer<typeof orderSideSchema>;
export type TimeInForce = z.infer<typeof timeInForceSchema>;

/**
 * §5.1 lists limit / market / stop / post-only. `take_profit` exists in the
 * public contract but is a svc-trade concern: it is a stop with inverted
 * trigger semantics that the product layer maps down to `stop`/`stop_limit`
 * before it ever reaches the engine. The engine keeps one trigger rule.
 */
export type EngineOrderType = Exclude<z.infer<typeof orderTypeSchema>, 'take_profit'>;

/**
 * §5.1: "No balances, no users — it speaks in account IDs". These are opaque
 * strings to this service. It never resolves one to a user, a balance, or a
 * ledger account.
 */
export type AccountId = string;
export type OrderId = string;
export type MarketId = string;

/**
 * An order as the engine sees it: pre-validated by svc-trade (risk, funding,
 * tick/lot size) and already denominated in scaled bigints.
 */
export interface EngineOrder {
  readonly orderId: OrderId;
  readonly accountId: AccountId;
  readonly type: EngineOrderType;
  readonly side: OrderSide;
  readonly qty: Amount;
  /** Limit price. Required for `limit` and `stop_limit`, null otherwise. */
  readonly price: Amount | null;
  /** Trigger price. Required for `stop` and `stop_limit`, null otherwise. */
  readonly stopPrice: Amount | null;
  readonly tif: TimeInForce;
  /**
   * Caller-supplied expire instant for GTD/GTT. ISO-8601. The engine never
   * invents this — missing expireAt refuses rather than defaulting EOD.
   */
  readonly expireAt?: string | null;
  /**
   * Linked sibling for a TP+SL pair (OCO). First fill of either cancels the
   * other. Absent when the order is not in a pair. The engine does not invent
   * a trigger — existing stop/stop_limit prices still fire the legs.
   */
  readonly ocoSiblingId?: OrderId | null;
  /**
   * Rest only if filling would shrink this account's position on this book.
   * Position is net fills. The engine does not invent a mark.
   */
  readonly reduceOnly?: boolean;
  /**
   * Visible peak for an iceberg. Required when `iceberg` is set.
   * The engine does not invent a display.
   */
  readonly displayQty?: Amount | null;
  readonly iceberg?: boolean;
  /** Trail distance. Required to rest a trailing stop. The engine does not invent a distance. */
  readonly trail?: Amount | null;
  /** Injected mark the trail walks with. The engine does not invent a mark. */
  readonly mark?: Amount | null;
  /**
   * Minimum fill qty. Missing or zero is not set — the engine does not invent a default.
   * A clip below this floor does not occur.
   */
  readonly minQty?: Amount | null;
  /**
   * All-or-none. Missing or false is a normal order.
   * Fill the entire remaining qty or do not take a stub. The engine does not invent a fill.
   */
  readonly aon?: boolean;
  /**
   * Pegged to a reference. Unsupported — refuses rather than becoming a limit.
   * Missing or false is a normal order. The engine does not invent a reference price.
   */
  readonly peg?: boolean;
  /**
   * Midpoint. Unsupported — refuses rather than becoming a limit.
   * Missing or false is a normal order. The engine does not invent a mid.
   */
  readonly midpoint?: boolean;
  /**
   * Relative (pegged to best). Unsupported — refuses rather than becoming a limit.
   * Missing or false is a normal order. The engine does not invent a reference price.
   */
  readonly relative?: boolean;
  /**
   * Auction instruction. Unsupported — refuses rather than becoming a limit.
   * Missing or false is a normal order. The engine does not invent an auction price.
   */
  readonly auction?: boolean;
  /**
   * Benchmark instruction. Unsupported — refuses rather than becoming a limit.
   * Missing or false is a normal order. The engine does not invent a benchmark price.
   */
  readonly benchmark?: boolean;
}

export const REJECT_CODES = [
  'invalid_qty',
  'invalid_price',
  'missing_price',
  'unexpected_price',
  'missing_stop_price',
  'unexpected_stop_price',
  'invalid_tif',
  'duplicate_order_id',
  'post_only_would_cross',
  'fok_unfillable',
  'engine_disabled',
  'order_not_found',
  'version_mismatch',
  'oco_sibling_terminal',
  'invalid_oco_sibling',
  'engine_clock_missing',
  'missing_expire_at',
  'already_expired',
  'would_increase_position',
  'position_flat',
  'iceberg_display_missing',
  'iceberg_display_not_smaller',
  'missing_trail',
  'missing_mark',
  'min_qty_exceeds_qty',
  'aon_iceberg',
  'peg_unsupported',
  'midpoint_unsupported',
  'relative_unsupported',
  'auction_unsupported',
  'benchmark_unsupported',
  'self_trade',
  'session_unsupported',
  'market_halted',
  'venue_halted',
  'market_reduce_only',
  'market_post_only',
  'missing_operator',
] as const;

export type RejectCode = (typeof REJECT_CODES)[number];

export interface RejectReason {
  readonly code: RejectCode;
  readonly message: string;
}

/** A match. `price` is always the resting (maker) order's price — the taker pays the book. */
export interface Fill {
  readonly sequence: number;
  readonly makerOrderId: OrderId;
  readonly makerAccountId: AccountId;
  readonly takerOrderId: OrderId;
  readonly takerAccountId: AccountId;
  /** Side of the aggressor. The maker is by definition on the other side. */
  readonly takerSide: OrderSide;
  readonly price: Amount;
  readonly qty: Amount;
}

/** Where an order came to rest: the limit book, or the pending-trigger stop book. */
export interface RestingRef {
  readonly kind: 'book' | 'stop';
  readonly orderId: OrderId;
  readonly accountId: AccountId;
  readonly side: OrderSide;
  /** Limit price for `book`, trigger price for `stop`. */
  readonly price: Amount;
  readonly remaining: Amount;
  readonly sequence: number;
  /** Instruction version — increments on every accepted amend; independent of queue sequence. */
  readonly version: number;
}

export const CANCEL_REASONS = [
  'requested',
  'self_trade_prevention',
  'ioc_remainder',
  'market_remainder',
  'trigger_rejected',
  'oco_sibling_filled',
  'expired',
  'would_increase_position',
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number];

/**
 * Quantity that left the engine without filling. Unified across "the taker's
 * unfillable remainder" and other pulls that release a ledger hold.
 */
export interface CancelledRef {
  readonly orderId: OrderId;
  readonly accountId: AccountId;
  readonly remainingQty: Amount;
  readonly sequence: number;
  readonly reason: CancelReason;
}

/** What a stop order did once its trigger fired. */
export interface TriggerOutcome {
  readonly orderId: OrderId;
  /** Sequence assigned at activation — the resting remainder's time priority starts here, not when the stop was accepted. */
  readonly sequence: number;
  readonly fills: readonly Fill[];
  readonly resting: RestingRef | null;
  readonly cancellations: readonly CancelledRef[];
  readonly rejected?: RejectReason;
}

/**
 * The result of `submit`. A pure function of (book state, order): the same book
 * and the same order always produce the same result, byte for byte.
 *
 * Beyond the four fields §5.1 names, two more are carried because dropping them
 * would force the caller to diff book states to learn what happened:
 *   - `cancellations` — quantity that must have its ledger hold released.
 *   - `triggered`     — stop orders this submission's prints activated.
 */
export interface SubmitResult {
  readonly accepted: boolean;
  /** Assigned only on acceptance; a rejected order never touched the book and never consumes a sequence. */
  readonly sequence: number | null;
  readonly fills: readonly Fill[];
  readonly resting: RestingRef | null;
  readonly rejected?: RejectReason;
  readonly cancellations: readonly CancelledRef[];
  readonly triggered: readonly TriggerOutcome[];
}

export interface CancelResult {
  readonly cancelled: boolean;
  readonly orderId: OrderId;
  readonly sequence: number | null;
  readonly cancellation: CancelledRef | null;
}

/**
 * Pull live rest/stop for one account on one book.
 * Present side is that side only. Session is not an engine field — a session id refuses rather than inventing one.
 */
export interface MassCancelResult {
  readonly accepted: boolean;
  readonly accountId: AccountId;
  readonly cancellations: readonly CancelledRef[];
  readonly rejected?: RejectReason;
}

/** Operator halt/resume of one market. Caller identity is operatorId. No duration. */
export interface MarketHaltResult {
  readonly accepted: boolean;
  readonly marketId: MarketId;
  readonly halted: boolean;
  readonly operatorId: string | null;
  readonly rejected?: RejectReason;
}

/** Operator halt-all / resume-all. Caller identity is operatorId. No duration. Not one-market halt. */
export interface VenueKillResult {
  readonly accepted: boolean;
  readonly halted: boolean;
  readonly operatorId: string | null;
  readonly rejected?: RejectReason;
}

/** Operator reduce-only/resume of one market. Caller identity is operatorId. No duration. Not halt. */
export interface MarketReduceOnlyResult {
  readonly accepted: boolean;
  readonly marketId: MarketId;
  readonly reduceOnly: boolean;
  readonly operatorId: string | null;
  readonly rejected?: RejectReason;
}

/** Operator post-only/resume of one market. Caller identity is operatorId. No duration. Not halt. */
export interface MarketPostOnlyResult {
  readonly accepted: boolean;
  readonly marketId: MarketId;
  readonly postOnly: boolean;
  readonly operatorId: string | null;
  readonly rejected?: RejectReason;
}

/**
 * Native amend (PX-S03 §8.2). One engine command, never cancel-plus-new.
 *
 * Omitted patch fields inherit. `qty` is the new remaining quantity the engine
 * is holding — already-filled quantity is not stored here and cannot be moved.
 */
export interface EngineAmend {
  readonly orderId: OrderId;
  readonly expectedVersion: number;
  readonly qty?: Amount;
  readonly price?: Amount;
  readonly stopPrice?: Amount;
  readonly tif?: TimeInForce;
  readonly expireAt?: string;
}

export type AmendPriority = 'retained' | 'lost';

export interface AmendResult {
  readonly accepted: boolean;
  readonly orderId: OrderId;
  /** Queue sequence after the command — unchanged when priority is retained. */
  readonly sequence: number | null;
  readonly version: number | null;
  readonly priority: AmendPriority | null;
  readonly fills: readonly Fill[];
  readonly resting: RestingRef | null;
  readonly rejected?: RejectReason;
  readonly cancellations: readonly CancelledRef[];
  readonly triggered: readonly TriggerOutcome[];
}

// ── Serialised state (§5.1 replay + §5.4 determinism) ────────────────

/**
 * The wire and snapshot form of the book. Every value is a decimal string:
 * a snapshot that round-trips through JSON must not lose a single unit at the
 * 18th decimal place, and `JSON.stringify(0.1 + 0.2)` is why.
 */
export interface RestingOrderState {
  readonly orderId: string;
  readonly accountId: string;
  readonly remaining: string;
  readonly sequence: number;
  /** Absent on pre-amend snapshots; restore treats missing as 1. */
  readonly version?: number;
  /** Present only when this resting order is in an OCO pair. */
  readonly ocoSiblingId?: string;
  /** Present only on GTD/GTT. Caller instant; never invented. */
  readonly expireAt?: string;
  /** Present only when the rest is reduce-only. */
  readonly reduceOnly?: boolean;
  /** Present only when the rest is post-only. A later amend must not take. */
  readonly postOnly?: boolean;
  /** Peak display. Absent when the rest is not an iceberg. */
  readonly displayQty?: string;
  /** Currently visible slice. Hidden is remaining minus this. */
  readonly displayRemaining?: string;
  /** Minimum fill qty. Absent when not set. */
  readonly minQty?: string;
  /** Present only when the rest is all-or-none. */
  readonly aon?: boolean;
}

export interface PriceLevelState {
  readonly price: string;
  readonly orders: readonly RestingOrderState[];
}

export interface StopOrderState {
  readonly orderId: string;
  readonly accountId: string;
  readonly type: EngineOrderType;
  readonly side: OrderSide;
  readonly qty: string;
  readonly price: string | null;
  readonly stopPrice: string;
  readonly tif: TimeInForce;
  readonly sequence: number;
  readonly version?: number;
  readonly ocoSiblingId?: string;
  readonly expireAt?: string;
  readonly reduceOnly?: boolean;
  /** Minimum fill qty. Absent when not set. */
  readonly minQty?: string;
  /** Present only when the stop is all-or-none. */
  readonly aon?: boolean;
}

export interface BookState {
  readonly marketId: string;
  readonly sequence: number;
  readonly lastTradePrice: string | null;
  /** Descending by price. */
  readonly bids: readonly PriceLevelState[];
  /** Ascending by price. */
  readonly asks: readonly PriceLevelState[];
  /** Ascending by acceptance sequence — that ordering is what makes trigger cascades deterministic. */
  readonly stops: readonly StopOrderState[];
  /**
   * OCO members that have already left the book (filled or cancelled). Absent when empty so a book that never linked a pair serialises identically.
   */
  readonly ocoTerminal?: readonly string[];
  /**
   * Net fill qty per account on this book (signed decimal). Absent when flat.
   * Never a mark.
   */
  readonly positions?: readonly { readonly accountId: string; readonly qty: string }[];
}

export interface EngineLiveOrder {
  readonly marketId: MarketId;
  readonly orderId: OrderId;
  readonly accountId: AccountId;
  readonly kind: 'book' | 'stop';
  readonly side: OrderSide;
  readonly price: string;
  readonly remaining: string;
  readonly sequence: number;
  readonly version: number;
}
