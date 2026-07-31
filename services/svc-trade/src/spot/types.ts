import type { AssetClass, ScheduleKey } from '@intafaced/contracts';
import type { Amount } from '@intafaced/ledger-client';

/**
 * The domain, in memory.
 *
 * Every money-shaped field is an `Amount` — the scaled bigint from
 * `@intafaced/ledger-client`. Rows come out of Postgres as decimal strings and
 * are parsed at exactly one place (`rows.ts`); nothing below this line ever
 * sees a `number` holding value, because 0.1 + 0.2 is not 0.3 and the ledger
 * reconciles to 18 decimal places.
 *
 * `bps` fields ARE numbers. A basis point is a count, not a quantity of value,
 * and `mulBps` requires an integer.
 */

export type MarketKind = 'spot' | 'futures' | 'options';
export type MarketStatus = 'pending' | 'active' | 'halted' | 'delisted';
export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'PO';
export type OrderStatus = 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected' | 'expired';
export type Liquidity = 'maker' | 'taker';

export interface Market {
  readonly id: string;
  readonly symbol: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly kind: MarketKind;
  readonly tickSize: Amount;
  readonly lotSize: Amount;
  readonly minQty: Amount;
  readonly maxQty: Amount | null;
  readonly minNotional: Amount;
  readonly status: MarketStatus;
  readonly makerBps: number;
  readonly takerBps: number;
  readonly listedAt: Date | null;
  readonly assetClass: AssetClass;
  /**
   * When this market accepts orders.
   *
   * `status` answers "is this market live at all"; the schedule answers "is it
   * open right now". They are different questions, and conflating them is how
   * a Saturday EUR/USD order gets funded into a venue that cannot fill it — a
   * forex pair is permanently `active` and shut every weekend.
   */
  readonly schedule: ScheduleKey;
}

export interface OrderRecord {
  readonly id: string;
  readonly userId: string;
  readonly subAccountId: string | null;
  readonly marketId: string;
  readonly clientOrderId: string | null;
  readonly side: OrderSide;
  readonly type: OrderType;
  readonly price: Amount | null;
  readonly qty: Amount;
  readonly filledQty: Amount;
  readonly status: OrderStatus;
  readonly tif: TimeInForce;
  readonly holdAsset: string;
  readonly holdAmount: Amount;
  readonly feeDiscountBps: number;
  readonly protectionPrice: Amount | null;
  readonly engineSequence: number | null;
  readonly rejectCode: string | null;
  readonly createdAt: Date;
}

export interface FillRecord {
  readonly id: string;
  readonly orderId: string;
  readonly counterOrderId: string;
  readonly marketId: string;
  readonly userId: string;
  readonly side: OrderSide;
  readonly liquidity: Liquidity;
  readonly price: Amount;
  readonly qty: Amount;
  readonly quoteAmount: Amount;
  readonly feeAsset: string;
  readonly feeAmount: Amount;
  readonly feeBps: number;
  readonly sequence: number;
  readonly ts: Date;
}

/**
 * One public tape print — one match, no user or order identity.
 *
 * Derived from the taker leg of `trade.fills`. The public REST tape must never
 * leak who traded; bots only need price, size, side, and when.
 */
export interface PublicTapePrint {
  readonly id: string;
  readonly side: OrderSide;
  readonly price: Amount;
  readonly qty: Amount;
  readonly quoteAmount: Amount;
  readonly sequence: number;
  readonly ts: Date;
}

/**
 * One aggregated candle, derived from the same taker fills as the public tape.
 *
 * Every field is a measurement of real trades: open/close are the first and
 * last traded price in the bucket by engine sequence, high/low the extremes,
 * volume the summed base quantity. There is no modelled or carried-forward
 * value anywhere in this shape — a bucket in which nothing traded produces no
 * Candle at all rather than a flat one, because a flat candle is a print that
 * never happened.
 *
 * `openTimeMs` is the bucket's opening boundary in unix ms (CCXT convention).
 */
export interface Candle {
  readonly openTimeMs: number;
  readonly open: Amount;
  readonly high: Amount;
  readonly low: Amount;
  readonly close: Amount;
  readonly volume: Amount;
}

/**
 * Every way this service refuses.
 *
 * A closed union rather than free text because an SLO dashboard groups by it
 * and a client branches on it: `trade.market_halted` is an operator action
 * working as intended, `trade.hold_uncovered` is an alarm, and collapsing the
 * two into "order failed" makes both unactionable.
 */
export type TradeErrorCode =
  | 'trade.market_not_found'
  | 'trade.market_not_tradable'
  // Distinct from `market_not_tradable` on purpose: that one means an operator
  // halted the listing and the caller should stop asking, this one means the
  // venue is between sessions and the same order will be fine on Monday.
  | 'trade.market_closed'
  | 'trade.market_kind_unsupported'
  | 'trade.order_type_unsupported'
  | 'trade.invalid_qty'
  | 'trade.invalid_price'
  | 'trade.below_min_notional'
  | 'trade.no_reference_price'
  | 'trade.spot_disabled'
  | 'trade.order_not_found'
  | 'trade.order_not_open'
  | 'trade.not_owner'
  | 'trade.perks_unavailable'
  | 'trade.dust_fill'
  | 'trade.hold_uncovered'
  | 'trade.convert_disabled'
  | 'trade.convert_no_liquidity'
  | 'trade.convert_insufficient_depth'
  | 'trade.convert_price_moved'
  | 'trade.convert_missing_id'
  | 'trade.convert_invalid_qty'
  | 'trade.convert_bad_depth'
  | 'trade.convert_bad_spread'
  | 'trade.convert_spread_too_high'
  /** Identity S2S ownership consult failed — refuse rather than store an unvalidated id */
  | 'trade.sub_account_unavailable'
  /** Missing or foreign sub-account (existence not leaked) */
  | 'trade.sub_account_denied'
  /** Caller owns the id but it is soft-revoked */
  | 'trade.sub_account_revoked';

export class TradeError extends Error {
  constructor(
    message: string,
    readonly code: TradeErrorCode,
  ) {
    super(message);
    this.name = 'TradeError';
  }
}
