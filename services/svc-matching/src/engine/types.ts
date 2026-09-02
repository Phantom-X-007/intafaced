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
   * Caller-supplied session for cancel-on-disconnect. The engine never invents
   * this — missing sessionId is untagged, not a default session.
   */
  readonly sessionId?: string | null;
  /**
   * Caller-supplied client order id. Unique in the account/environment domain
   * (PX-S03 §5.1). Missing is allowed. The engine never invents this.
   */
  readonly clientOrderId?: string | null;
  /**
   * Caller-supplied environment for the client-id domain. Missing is empty in
   * the mill key, not a silent 'live' stamp.
   */
  readonly environment?: string | null;
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
  /** Strike. Required to rest an option. The engine does not invent a strike. */
  readonly strike?: Amount | null;
  /** Expiry. Required to rest an option. ISO datetime. The engine does not invent an expiry. */
  readonly expiry?: string | null;
  /** Exercise a long option at strike. Matching refuses missing strike/expiry. The engine does not invent a mark. */
  readonly exercise?: boolean;
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
   * Pegged to a caller reference + offset. Missing those refuses.
   * Missing or false is a normal order. The engine does not invent a mid.
   */
  readonly peg?: boolean;
  /**
   * Midpoint. Unsupported — refuses rather than becoming a limit.
   * Missing or false is a normal order. The engine does not invent a mid.
   */
  readonly midpoint?: boolean;
  /**
   * Relative to a caller reference + offset. Missing those refuses.
   * Missing or false is a normal order. The engine does not invent a mid.
   */
  readonly relative?: boolean;
  /** Caller reference for peg/relative. The engine does not invent a mid. */
  readonly reference?: Amount | null;
  /** Caller offset for peg/relative. Added to reference. Missing refuses. */
  readonly offset?: Amount | null;
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
  /**
   * Price collar. Missing or false is a normal order.
   * When true, caller min and max are required. The engine does not invent last or mid.
   */
  readonly collar?: boolean;
  /** Caller collar min. Missing when collar is requested refuses. */
  readonly min?: Amount | null;
  /** Caller collar max. Missing when collar is requested refuses. */
  readonly max?: Amount | null;
  /**
   * Caller min notional. Missing or zero is not requested.
   * When set, a missing notional (no caller price) refuses. The engine does not invent last.
   */
  readonly minNotional?: Amount | null;
  /**
   * Combo / multi-leg. Missing or false is a normal order.
   * Named legs with ratios are required. The engine does not invent a combo book
   * or silently rest two independent options.
   */
  readonly combo?: boolean;
  /** Named combo legs. Missing when combo is requested refuses. */
  readonly legs?: readonly ComboLeg[] | null;
}
