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
  reduceOnly: boolean;
  /** Resting post-only. A later amend must not take. */
  postOnly: boolean;
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
  reduceOnly: boolean;
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
  readonly reduceOnly: boolean;
}

interface MatchOutcome {
  readonly fills: Fill[];
  readonly remaining: Amount;
  readonly cancellations: CancelledRef[];
}

export const SELF_TRADE_PREVENTION = 'cancel-oldest' as const;

function reject(code: RejectReason['code'], message: string): RejectReason {
  return { code, message };
}
