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

/**
 * CX-9 reconcile diagnoses (Spec · Plan P1-5).
 *
 * Operator / recovery method — not a silent cancel-all of healthy opens.
 */
export type ReconcileCase =
  'orphan_pending' | 'open_hold_no_engine' | 'open_hold_engine_cleared' | 'open_engine_no_hold' | 'terminal' | 'not_found';

export type ReconcileAction = 'deleted' | 'released' | 'fail_closed' | 'none';

export interface ReconcileResult {
  readonly orderId: string;
  readonly case: ReconcileCase;
  readonly action: ReconcileAction;
  /** Decimal string of ledger hold for this order before action. */
  readonly holdBefore: string;
  /** Whether the engine reported the order live at cancel probe (null if not probed). */
  readonly engineLive: boolean | null;
  readonly detail: string;
}

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
  /** Paper / simulated market — never posts real ledger holds (academy paper drills). */
  readonly paper: boolean;
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
  /** Seed/mm liquidity order (SD-2). Public volume excludes these (SD-3). */
  readonly seeded: boolean;
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
  /** Place without clientOrderId — retry would open a second hold. */
  | 'trade.client_order_id_required'
  | 'trade.no_reference_price'
  | 'trade.spot_disabled'
  /**
   * A futures market exists and this deployment does not take orders on it
   * (`TRADE_FUTURES_ENABLED` off). Distinct from `market_kind_unsupported`,
   * which claims the service will NEVER serve the kind: this one is an operator
   * setting, so a client must keep the symbol and stop placing, not drop it.
   */
  | 'trade.futures_disabled'
  | 'trade.seed_disabled'
  | 'trade.seed_must_make'
  | 'trade.order_not_found'
  | 'trade.order_not_open'
  | 'trade.not_owner'
  | 'trade.perks_unavailable'
  | 'trade.dust_fill'
  /**
   * A match is legal on the grid but fees leave a side with a zero receivable
   * (`mulBps` ceil on a 1-wei leg). Refused BEFORE fill rows so the fills table
   * cannot permanently outrun the ledger.
   */
  | 'trade.fee_exceeds_fill'
  /**
   * Forex/commodity production listing without fiat settlement rails (D-S-05).
   * Model/paper listings remain legal; this is the production-list lie.
   */
  | 'trade.unsettled_asset_class_listing'
  /**
   * Options listing refused because settlement fixing is not configured (D7).
   * `TRADE_OPTIONS_SETTLEMENT_FIXING` empty → refuse. Distinct from terms.
   */
  | 'trade.options_fixing_unconfigured'
  /**
   * Options listing refused for incomplete contract terms (half-list) or terms
   * on a non-options kind. Schema CHECK `markets_options_terms_ck` is the same rule.
   */
  | 'trade.options_terms_incomplete'
  /**
   * Real-money futures list/enable refused because the insurance fund for the
   * quote asset is empty (DIRECTION:33). Distinct from `trade.insurance_underfunded`
   * (shortfall cover on an open position). Does not encode a target size.
   */
  | 'trade.insurance_fund_empty'
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
  | 'trade.otc_desk_law_blank'
  | 'trade.otc_stake_gate'
  | 'trade.otc_stake_unavailable'
  | 'trade.otc_no_reference_price'
  | 'trade.otc_invalid_qty'
  | 'trade.otc_invalid_price'
  | 'trade.otc_bad_spread'
  | 'trade.otc_quote_expired'
  | 'trade.otc_last_look_forbidden'
  | 'trade.otc_not_owner'
  | 'trade.otc_quote_missing'
  | 'trade.otc_settle_refused'
  /** Algo (D-S-04 TWAP) kill-switch / schedule / state. */
  | 'trade.algo_disabled'
  | 'trade.algo_invalid_qty'
  | 'trade.algo_invalid_schedule'
  | 'trade.algo_unsupported_kind'
  | 'trade.algo_not_found'
  | 'trade.algo_duplicate_id'
  | 'trade.algo_bad_state'
  | 'trade.algo_no_liquidity'
  | 'trade.algo_price_band'
  | 'trade.algo_mark_unusable'
  | 'trade.algo_mark_missing'
  | 'trade.algo_insufficient_balance'
  | 'trade.algo_child_refused'
  | 'trade.algo_child_cancel_failed'
  | 'trade.algo_principal_unavailable'
  | 'trade.algo_market_closed'
  /**
   * Resume would stretch the schedule past 2× the order's own durationMs
   * (ADR 2026-08-08). Trader may cancel-and-recreate; parent stays paused.
   */
  | 'trade.algo_resume_extends_too_far'
  | 'trade.algo_cancel_incomplete'
  /** Identity S2S ownership consult failed — refuse rather than store an unvalidated id */
  | 'trade.sub_account_unavailable'
  /** Missing or foreign sub-account (existence not leaked) */
  | 'trade.sub_account_denied'
  /** Caller owns the id but it is soft-revoked */
  | 'trade.sub_account_revoked'
  /**
   * Two DIFFERENT matches claimed one `(market, sequence, role)`.
   *
   * Not a redelivery — that case is absorbed silently and correctly. This is
   * the engine's business key being REUSED, which means `fillIdFor(market,
   * seq)` no longer identifies one match and the ledger's `trade.fill:<id>`
   * key would fold two trades onto one transaction. Loud on purpose; see
   * `settleFill`.
   */
  | 'trade.fill_sequence_conflict';

export class TradeError extends Error {
  constructor(
    message: string,
    readonly code: TradeErrorCode,
  ) {
    super(message);
    this.name = 'TradeError';
  }
}
