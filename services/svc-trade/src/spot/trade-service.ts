import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import type { Timeframe } from '@intafaced/exchange-contract';
import type { EventBus } from '@intafaced/events';
import { requireScope, type Principal } from '@intafaced/auth';
import {
  formatAmount,
  InsufficientFundsError,
  mul,
  mulBps,
  orderHoldAccount,
  parseAmount,
  recipes,
  sub,
  type Amount,
  type LedgerClient,
} from '@intafaced/ledger-client';
import { withMoneySpan } from '../tracing.js';
import { queryCandlesFromFills } from './candles.js';
import { fillPayAmounts, fillReceivablesSurviveFees, ratesForFill } from './fees.js';
import { fillIdFor, fillLegIdFor, orderIdFor } from './ids.js';
import {
  assertMarketOpen,
  assertNotional,
  assertPrice,
  assertQty,
  assertSpotSurface,
  assertTradable,
  holdFor,
  protectionPriceFor,
  requireSupportedType,
} from './risk.js';
import { toFill, toMarket, toOrder, type FillRow, type MarketRow, type OrderRow } from './rows.js';
import type { RankPerksSource } from './rank-perks.js';
import { NoSubAccounts, assertSubAccountOwned, type SubAccountOwnershipSource } from './sub-account-ownership.js';
import type { EngineCancellation, EngineFill, EngineSubmitRequest, EngineSubmitResult, MatchingClient } from './matching-client.js';
import { estimateConvert, presentConvertQuote } from '../convert/quote.js';
import { isHouseMmAccount } from '../mm/seed-market.js';
import { HOUSE_MM_USER_UUID } from './ids.js';
import {
  presentAlgoProgress,
  SqlTwapParentStore,
  TwapEngine,
  type AlgoProgressView,
  type AlgoQuotedMark,
  type CreateTwapInput,
  type TwapParent,
  type TwapParentStore,
} from '../algo/index.js';
import {
  TradeError,
  type Candle,
  type FillRecord,
  type Market,
  type MarketKind,
  type OrderRecord,
  type OrderSide,
  type OrderStatus,
  type OrderType,
  type PublicTapePrint,
  type ReconcileResult,
  type TimeInForce,
} from './types.js';

/**
 * svc-trade — THE PRODUCT LAYER (§5.2).
 *
 * The engine is pure because this file makes it safe to be. §5.1 lets
 * svc-matching hold no balances and validate no affordability, on one
 * condition: **every order it ever sees is already funded.** This service is
 * that condition.
 *
 * THE ORDER FLOW, in the order §5.2 specifies and in the order the code runs:
 *
 *   1. auth + scope check (`trade:write`)
 *   2. risk checks — market status, tick/lot grid, size limits, min notional
 *   3. `ledger.post(recipes.orderHold(...))` — quote for buys, base for sells
 *   4. submit to the matching engine
 *   5. on Fill    → `ledger.post(recipes.tradeFill(...))`
 *   6. on Cancel  → `ledger.post(recipes.orderHoldRelease(...))`
 *
 * Step 3 before step 4 is the whole design. Reverse them and a fill can print
 * against money that is not there — and a printed fill cannot be un-printed,
 * because the counterparty has already been told they traded.
 *
 * DOCTRINE §0.6 — this service holds no balances. `orders.filled_qty` is order
 * state in the base asset. `orders.hold_amount` is an immutable record of a
 * ledger post, written once. What a user is still owed back is *derived* from
 * the fills, never decremented, so there is no number here that can drift away
 * from the book.
 */

export interface TradeServiceOptions {
  /** Mirror of the `trade.spot` flag. OFF refuses new orders; cancels still work. */
  spotEnabled?: boolean;
  /**
   * Mirror of `TRADE_FUTURES_ENABLED` (`trade.futures` / D-S-01).
   *
   * DEFAULT FALSE — the one option in this interface whose default is the
   * restrictive reading and which nothing in the repo sets to `true` except an
   * operator's environment and the tests that prove both directions. OFF refuses
   * new orders on a futures market with `trade.futures_disabled`; cancels still
   * work, because a switch that traps funds is not a safety control.
   *
   * Orderability is all it grants. It does not open a margin position, does not
   * enable funding, and does not pick a leverage — see `assertTradable`.
   */
  futuresEnabled?: boolean;
  /**
   * Seed/mm bot place path (SD-4 kill-switch). OFF refuses `seeded: true` places.
   * Default false — seed must be deliberately enabled.
   */
  seedPlaceEnabled?: boolean;
  /** How far above the best ask a market buy may be funded. See `protectionPriceFor`. */
  marketSlippageCapBps?: number;
  /** Mirror of the `trade.convert` flag. OFF refuses convert quote + execute. */
  convertEnabled?: boolean;
  /**
   * Extra house edge on convert quotes, in bps of book notional.
   * Execution still walks the real book via market IOC; this is the RFQ mark-up
   * the one-tap surface shows the user before they tap.
   */
  convertSpreadBps?: number;
  /** How long an indicative quote is considered fresh (ms). */
  convertQuoteTtlMs?: number;
  /** Kill-switch for TWAP algo (D-S-04). OFF refuses create; cancel/pause still work. */
  algoEnabled?: boolean;
  /**
   * The clock the venue-hours check reads.
   *
   * `risk.ts` deliberately takes `at` as a parameter so a session boundary can
   * be tested; that only buys anything if the boundary is reachable from the
   * outside too. Without this seam the *ordering* claim — refused before any
   * hold is taken — could only be verified by reading the code, and on 5 days
   * out of 7 a test asserting it would pass for the wrong reason.
   *
   * Production leaves it unset and gets the real clock.
   */
  now?: () => Date;
  /**
   * Identity S2S ownership source for `subAccountId` on placeOrder.
   * Defaults to a source that answers "unknown" for every id (fail-closed:
   * any supplied subAccountId is denied until a real client is injected).
   */
  subAccounts?: SubAccountOwnershipSource;
  /** Override TWAP durable store (tests inject MemoryTwapParentStore). */
  algoStore?: TwapParentStore;
}

export interface ConvertQuoteRequest {
  symbol?: string;
  marketId?: string;
  side: OrderSide;
  qty: Amount;
}

export interface ConvertExecuteRequest extends ConvertQuoteRequest {
  /**
   * Retry key. Becomes `convert:<id>` on the underlying order so a double-tap
   * holds and submits once (same as clientOrderId on spot).
   */
  clientConvertId: string;
  /**
   * Optional worst average price the user will accept (decimal Amount).
   * Buy: refuse if re-quoted avg is higher. Sell: refuse if re-quoted avg is lower.
   */
  maxAvgPrice?: Amount | null;
}

export interface PlaceOrderInput {
  /** Either is accepted; `symbol` is what integrators use, `marketId` what internals use. */
  symbol?: string;
  marketId?: string;
  side: OrderSide;
  type: string;
  qty: Amount;
  price?: Amount | null;
  tif?: TimeInForce;
  /** The retry key. Strongly recommended — without one, a retry opens a second order. */
  clientOrderId?: string;
  subAccountId?: string;
  /**
   * Optional ceiling on the market-buy protection/funding price (convert M-03).
   * When set, the engine limit is `min(slippageCap, maxProtectionPrice)` so a
   * client maxAvgPrice binds execution, not only the pre-trade RFQ check.
   */
  maxProtectionPrice?: Amount | null;
  /**
   * Seed/mm honesty (SD-2). Only accepted when `seedPlaceEnabled` is on.
   * Flagged orders are excluded from public volume / tape (SD-3).
   */
  seeded?: boolean;
}

export interface ListMarketInput {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  tickSize: Amount;
  lotSize: Amount;
  minQty: Amount;
  maxQty?: Amount | null;
  minNotional: Amount;
  makerBps: number;
  takerBps: number;
  status?: Market['status'];
  /**
   * Default to a continuous crypto listing, because that is what every existing
   * caller means. A commodity or forex listing must name its schedule — the
   * database CHECK refuses a non-crypto class on `crypto-24x7`, so a listing
   * that forgets is rejected at insert rather than accepting weekend orders.
   */
  assetClass?: Market['assetClass'];
  schedule?: Market['schedule'];
  /** Falls back to the symbol; the column carries a NOT-NULL, length > 0 check. */
  displayName?: string;
  /** Paper market — drills only; placeOrder never posts ledger holds. */
  paper?: boolean;
  /**
   * `spot` (default) or `futures`. The column and its enum have existed since
   * `0000_trade_init.sql`, whose own comment says "the kind enum already carries
   * their values, so listing a futures market later is" additive — and this method
   * hardcoded `'spot'` anyway, so the only way a futures row reached
   * `trade.markets` was raw SQL in a test.
   *
   * LISTING IS NOT ENABLING, and the ADR is explicit that the two are different
   * acts: "modelling an instrument is always honest; listing one you cannot settle
   * never is" (`2026-08-04-instrument-enum-authority.md`). A futures row created
   * here is quotable and readable and takes no order at all unless
   * `TRADE_FUTURES_ENABLED` is on. `options` is accepted by the column and refused
   * by `assertTradable` on every path; nothing here changes that.
   */
  kind?: MarketKind;
}

export class TradeService {
  private readonly spotEnabled: boolean;
  private readonly futuresEnabled: boolean;
  private readonly seedPlaceEnabled: boolean;
  private readonly slippageCapBps: number;
  private readonly convertEnabled: boolean;
  private readonly convertSpreadBps: number;
  private readonly convertQuoteTtlMs: number;
  private readonly algoEnabled: boolean;
  private readonly now: () => Date;
  private readonly subAccounts: SubAccountOwnershipSource;
  /** D-S-04 TWAP scheduler — parent holds no value; children go through placeOrder. */
  private readonly algo: TwapEngine;
  /** Durable TWAP schedules — survives process restart (in-memory alone was residual). */
  private readonly algoStore: TwapParentStore;

  constructor(
    private readonly sql: Sql,
    private readonly ledger: LedgerClient,
    private readonly matching: MatchingClient,
    private readonly perks: RankPerksSource,
    private readonly bus: EventBus,
    options: TradeServiceOptions = {},
  ) {
    this.spotEnabled = options.spotEnabled ?? true;
    // `?? false`, and the asymmetry with the line above is the whole point: a
    // deploy that forgets to mention futures does not get futures.
    this.futuresEnabled = options.futuresEnabled ?? false;
    this.seedPlaceEnabled = options.seedPlaceEnabled ?? false;
    this.slippageCapBps = options.marketSlippageCapBps ?? 200;
    this.convertEnabled = options.convertEnabled ?? true;
    this.convertSpreadBps = options.convertSpreadBps ?? 10;
    this.convertQuoteTtlMs = options.convertQuoteTtlMs ?? 15_000;
    this.algoEnabled = options.algoEnabled ?? true;
    this.now = options.now ?? (() => new Date());
    this.subAccounts = options.subAccounts ?? new NoSubAccounts();
    this.algoStore = options.algoStore ?? new SqlTwapParentStore(sql);
    this.algo = new TwapEngine(
      {
        now: () => this.now(),
        randomId: () => crypto.randomUUID(),
        placeChild: async (req) => {
          // Child is an ordinary order — same path, same holds, same gates.
          const parent = this.algo.get(req.parentId);
          if (!parent) throw new TradeError(`algo ${req.parentId} not found`, 'trade.algo_not_found');
          const principal = this.algoPrincipals.get(parent.userId);
          if (!principal) {
            // ── SOCKET §13 · `socket.algo-principal-durability` ─────────────
            //
            // `algoPrincipals` is in-process and only ever written by
            // `createTwap`. `tickAllAlgos` rehydrates the PARENT from Postgres
            // but cannot rehydrate the caller's authority, so after a restart
            // every schedule that survived finds nothing here.
            //
            // The obvious fix — persist the principal with the parent — is not
            // a refactor: it stores an authorisation grant that outlives the
            // session that gave it, and how long a schedule may carry the right
            // to trade on someone's behalf is owner law, not a default to pick.
            // Minting a principal from the parent's userId is worse — that is
            // the service granting itself authority the user never presented.
            //
            // Until that is decided the honest behaviour is to STOP. The engine
            // halts on this code and leaves the schedule intact, so the user
            // finds an order that stopped with a stated reason and can cancel
            // or re-place it — rather than one that quietly ran to "completed"
            // having placed nothing.
            throw new TradeError(
              "this schedule outlived the session that authorised it — refusing to place on the caller's behalf (SOCKET §13 socket.algo-principal-durability)",
              'trade.algo_principal_unavailable',
            );
          }
          try {
            const order = await this.placeOrder(principal, {
              symbol: req.symbol,
              marketId: req.marketId,
              side: req.side,
              type: req.limitPrice === null ? 'market' : 'limit',
              qty: req.qty,
              price: req.limitPrice,
              tif: req.limitPrice === null ? 'IOC' : 'GTC',
              clientOrderId: req.clientOrderId,
              subAccountId: req.subAccountId ?? undefined,
            });
            return { orderId: order.id };
          } catch (err) {
            if (err instanceof InsufficientFundsError) {
              throw new TradeError(err.message, 'trade.algo_insufficient_balance');
            }
            throw err;
          }
        },
        cancelChild: async (orderId) => {
          const row = await this.sql<OrderRow[]>`SELECT * FROM trade.orders WHERE id = ${orderId} LIMIT 1`;
          if (!row[0]) return;
          // Already terminal — nothing to cancel; silent success is honest.
          if (row[0].status !== 'open' && row[0].status !== 'pending') return;
          // A cancel that does not cancel is worse than a refused cancel.
          // Open child without the live caller's principal must THROW so the
          // parent stays non-cancelled (engine cancel collects failures first).
          const principal = this.algoPrincipals.get(row[0].user_id);
          if (!principal) {
            throw new TradeError(
              `cannot cancel open algo child ${orderId} without the caller's principal — install principal on cancelAlgo before engine.cancel (never mint from userId)`,
              'trade.algo_principal_unavailable',
            );
          }
          await this.cancelOrder(principal, orderId);
        },
        bestOpposingPrice: async (marketId, side) => {
          const depth = await this.matching.depth(marketId, 1);
          const level = side === 'buy' ? depth.asks[0] : depth.bids[0];
          return level ? parseAmount(level[0]) : null;
        },
        markFor: async (marketId): Promise<AlgoQuotedMark | null> => {
          const depth = await this.matching.depth(marketId, 1);
          const bid = depth.bids[0] ? parseAmount(depth.bids[0][0]) : null;
          const ask = depth.asks[0] ? parseAmount(depth.asks[0][0]) : null;
          if (bid === null || ask === null || bid <= 0n || ask <= 0n) return null;
          return {
            marketId,
            price: (bid + ask) / 2n,
            asOf: this.now(),
            quality: 'mid',
          };
        },
      },
      {
        onChange: (parent, plan) => this.algoStore.save({ parent, plan }),
      },
    );
  }

  private readonly algoPrincipals = new Map<string, Principal>();

  // ── Listings (operator surface) ────────────────────────────────────────────

  /**
   * List a market. Operator-only; there is no user-facing path to this.
   *
   * A listing decides the tick and lot grid, and therefore decides whether a
   * legal fill on this market can have a quote amount of zero. The database
   * enforces `tick x lot >= 1 wei` because a bad listing would otherwise lie
   * dormant until the first partial fill hit it in production.
   */
  async listMarket(input: ListMarketInput): Promise<Market> {
    const assetClass = input.assetClass ?? 'crypto';
    const paper = input.paper === true;
    const status = input.status ?? 'active';
    // D-S-05 / instrument-enum ADR: modelling forex/commodities is honest;
    // listing them for production trading without fiat settlement is the lie.
    // paper=true (drills) and non-active status remain allowed.
    if ((assetClass === 'forex' || assetClass === 'commodity') && status === 'active' && !paper) {
      throw new TradeError(
        `${assetClass} cannot be listed for production trading until fiat settlement rails exist — list as paper=true or status pending/halted (model is fine)`,
        'trade.unsettled_asset_class_listing',
      );
    }
    const rows = await this.sql<MarketRow[]>`
      INSERT INTO trade.markets (
        symbol, base_asset, quote_asset, kind, tick_size, lot_size,
        min_qty, max_qty, min_notional, status, maker_bps, taker_bps, listed_at,
        asset_class, schedule, display_name, paper
      ) VALUES (
        ${input.symbol}, ${input.baseAsset}, ${input.quoteAsset}, ${input.kind ?? 'spot'},
        ${formatAmount(input.tickSize)}::numeric, ${formatAmount(input.lotSize)}::numeric,
        ${formatAmount(input.minQty)}::numeric,
        ${input.maxQty == null ? null : formatAmount(input.maxQty)}::numeric,
        ${formatAmount(input.minNotional)}::numeric,
        ${status}, ${input.makerBps}, ${input.takerBps}, now(),
        ${assetClass}, ${input.schedule ?? 'crypto-24x7'},
        ${input.displayName ?? input.symbol}, ${paper}
      )
      ON CONFLICT (symbol) DO UPDATE SET updated_at = now()
      RETURNING id, symbol, base_asset, quote_asset, kind, tick_size, lot_size,
                min_qty, max_qty, min_notional, status, maker_bps, taker_bps, listed_at,
                asset_class, schedule, paper
    `;
    return toMarket(rows[0] as MarketRow);
  }

  /**
   * Halt, resume or delist a market.
   *
   * Halting does NOT touch open orders or their holds. An operator halting a
   * market is stopping new risk, not confiscating positions — the funds stay
   * held and the orders stay cancellable, which is the only behaviour that
   * lets a user out of a market the operator has frozen.
   */
  async setMarketStatus(marketId: string, status: Market['status']): Promise<Market> {
    const rows = await this.sql<MarketRow[]>`
      UPDATE trade.markets SET status = ${status}, updated_at = now() WHERE id = ${marketId}
      RETURNING id, symbol, base_asset, quote_asset, kind, tick_size, lot_size,
                min_qty, max_qty, min_notional, status, maker_bps, taker_bps, listed_at,
                asset_class, schedule, paper
    `;
    const row = rows[0];
    if (!row) throw new TradeError(`market ${marketId} not found`, 'trade.market_not_found');
    return toMarket(row);
  }

  async markets(): Promise<Market[]> {
    const rows = await this.sql<MarketRow[]>`
      SELECT id, symbol, base_asset, quote_asset, kind, tick_size, lot_size,
             min_qty, max_qty, min_notional, status, maker_bps, taker_bps, listed_at,
                asset_class, schedule, paper
        FROM trade.markets ORDER BY symbol ASC
    `;
    return rows.map(toMarket);
  }

  // ── Convert — one-tap RFQ against the book (§5.2 trade.convert) ────────────

  /**
   * Indicative RFQ. Read-only against the engine depth; no hold, no order row.
   *
   * The number the user sees includes the published convert spread. Execution
   * still goes through the normal hold → market IOC path so convert cannot invent
   * a second money path around purpose-keyed holds.
   */
  async convertQuote(principal: Principal, input: ConvertQuoteRequest) {
    requireScope(principal, 'trade:read');
    return this.buildConvertQuote(input);
  }

  /**
   * One-tap execute. Re-quotes against live depth, optionally enforces the
   * user's worst acceptable average, then places a market IOC order under a
   * deterministic client id so a double-tap is safe.
   */
  async convertExecute(principal: Principal, input: ConvertExecuteRequest): Promise<OrderRecord> {
    return withMoneySpan(
      'trade.convertExecute',
      {
        operation: 'convert',
        userId: principal.userId,
        symbol: input.symbol,
        side: input.side,
        qty: formatAmount(input.qty),
      },
      async (span) => {
        requireScope(principal, 'trade:write');
        if (!input.clientConvertId || input.clientConvertId.length < 1 || input.clientConvertId.length > 48) {
          throw new TradeError('clientConvertId is required (1–48 chars) for convert idempotency', 'trade.convert_missing_id');
        }

        // Live re-quote — never execute on a stale number the user never saw.
        // Uses the same path as `convertQuote` without re-checking trade:read
        // (write is the stricter gate and is already held).
        const quote = await this.buildConvertQuote(input);
        const liveAvg = parseAmount(quote.avgPrice);
        if (input.maxAvgPrice != null) {
          if (input.side === 'buy' && liveAvg > input.maxAvgPrice) {
            throw new TradeError(
              `convert price ${quote.avgPrice} is above your max ${formatAmount(input.maxAvgPrice)}`,
              'trade.convert_price_moved',
            );
          }
          if (input.side === 'sell' && liveAvg < input.maxAvgPrice) {
            throw new TradeError(
              `convert price ${quote.avgPrice} is below your min ${formatAmount(input.maxAvgPrice)}`,
              'trade.convert_price_moved',
            );
          }
        }

        const order = await this.placeOrder(principal, {
          symbol: input.symbol,
          marketId: input.marketId,
          side: input.side,
          type: 'market',
          qty: input.qty,
          tif: 'IOC',
          clientOrderId: `convert:${input.clientConvertId}`,
          // Bind convert maxAvgPrice into funding/engine protection (M-03), not
          // only the live re-quote gate above.
          maxProtectionPrice: input.side === 'buy' ? (input.maxAvgPrice ?? null) : null,
        });
        span.setAttribute('intafaced.order_id', order.id);
        span.setAttribute('intafaced.order_status', order.status);
        return order;
      },
    );
  }

  private async buildConvertQuote(input: ConvertQuoteRequest) {
    if (!this.convertEnabled) {
      throw new TradeError('convert is disabled by the operator kill-switch', 'trade.convert_disabled');
    }
    if (!this.spotEnabled) {
      throw new TradeError('spot trading is disabled by the operator kill-switch', 'trade.spot_disabled');
    }

    const market = await this.requireMarket(input);
    // Convert is a spot-shaped RFQ and says so itself, rather than inheriting the
    // order path's kind refusal — which is about to become a flag. See
    // `assertSpotSurface`.
    assertSpotSurface(market, 'convert');
    assertTradable(market);
    assertQty(market, input.qty);

    const depth = await this.matching.depth(market.id, 50);
    const levels = input.side === 'buy' ? depth.asks : depth.bids;
    const estimate = estimateConvert({
      side: input.side,
      qty: input.qty,
      levels,
      convertSpreadBps: this.convertSpreadBps,
      tickSize: market.tickSize,
    });

    if (!estimate.fullyFilled) {
      throw new TradeError(
        `insufficient book depth to convert ${formatAmount(input.qty)} ${market.baseAsset} — only ${formatAmount(estimate.filledQty)} available`,
        'trade.convert_insufficient_depth',
      );
    }

    const expiresAt = new Date(Date.now() + this.convertQuoteTtlMs).toISOString();
    return presentConvertQuote(estimate, {
      symbol: market.symbol,
      side: input.side,
      requestedQty: input.qty,
      convertSpreadBps: this.convertSpreadBps,
      expiresAt,
    });
  }

  // ── The order flow (§5.2) ──────────────────────────────────────────────────

  async placeOrder(principal: Principal, input: PlaceOrderInput): Promise<OrderRecord> {
    return withMoneySpan(
      'trade.placeOrder',
      {
        operation: 'place_order',
        userId: principal.userId,
        symbol: input.symbol,
        side: input.side,
        qty: formatAmount(input.qty),
      },
      async (span) => {
        const order = await this.placeOrderInner(principal, input);
        span.setAttribute('intafaced.order_id', order.id);
        span.setAttribute('intafaced.order_status', order.status);
        // User-visible lifecycle (private WS). Idempotent on open snapshot so a
        // placeOrder retry that re-finds the same row does not spam the bus.
        await this.publishOrderUpdated(order);
        return order;
      },
    );
  }

  private async placeOrderInner(principal: Principal, input: PlaceOrderInput): Promise<OrderRecord> {
    // ── 1 · AUTH + SCOPE ────────────────────────────────────────────────────
    // First, before anything is read and long before anything is held. The
    // tRPC router applies the same check as a `scopedProcedure`; it is repeated
    // here so that every caller of this service — router, event consumer,
    // future gRPC edge — passes through the same gate, rather than the gate
    // living in one transport.
    requireScope(principal, 'trade:write');
    const userId = principal.userId;

    // NO ORDERABLE PLANE AT ALL — refused before the registry is touched.
    //
    // This check used to be `if (!this.spotEnabled)`, and it runs BEFORE
    // `requireMarket` on purpose: an operator who has halted the venue should be
    // told the venue is halted, not sent on a symbol lookup that answers
    // `market_not_found` for a market that exists. Keeping it here preserves that
    // ordering exactly.
    //
    // With futures orderable there are two planes, so the pre-resolution refusal
    // can only fire when NEITHER can take an order; the per-kind answer needs the
    // market and comes straight after it is loaded. With `TRADE_FUTURES_ENABLED`
    // off — the shipped default — `!spotEnabled && !futuresEnabled` reduces to
    // `!spotEnabled` and this line behaves identically to the one it replaced.
    if (!this.spotEnabled && !this.futuresEnabled) {
      throw new TradeError('spot trading is disabled by the operator kill-switch', 'trade.spot_disabled');
    }

    const seeded = input.seeded === true;
    if (seeded && !this.seedPlaceEnabled) {
      throw new TradeError('seed/mm place is disabled by the operator kill-switch', 'trade.seed_disabled');
    }

    // Ownership + revoked gate (identity S2S). Before any row or hold — a
    // foreign or revoked id must never land on trade.orders.sub_account_id.
    // Transport failure refuses the order (fail closed), same as rank perks.
    if (input.subAccountId != null) {
      await assertSubAccountOwned(this.subAccounts, userId, input.subAccountId);
    }

    // ── 2 · RISK CHECKS ─────────────────────────────────────────────────────
    const market = await this.requireMarket(input);

    // The per-kind half of the kill-switch. `TRADE_SPOT_ENABLED` is the spot
    // plane's switch and stays exactly that — it does not halt futures, and
    // `TRADE_FUTURES_ENABLED` does not halt spot. Two planes, two switches; a
    // single boolean standing for both would make an operator stopping one stop
    // the other, and there is no version of that which is the honest answer.
    if (market.kind === 'spot' && !this.spotEnabled) {
      throw new TradeError('spot trading is disabled by the operator kill-switch', 'trade.spot_disabled');
    }
    assertTradable(market, { futuresEnabled: this.futuresEnabled });

    // Stage-1 paper isolation (academy.paper-trading): a paper market must never
    // post orderHold / tradeFill against real available balances. Live markets
    // keep the funded path below unchanged.
    if (market.paper) {
      return this.placePaperOrderIsolated(principal, input, market);
    }

    // Before any hold is taken. A closed venue cannot fill, so funding an order
    // into one locks the user's balance behind a book nobody is matching until
    // the session reopens.
    //
    // Read ONCE, here, and passed down. Calling the clock twice on one order
    // could straddle a session boundary and decide two different things about
    // the same request.
    assertMarketOpen(market, this.now());
    const orderType: OrderType = requireSupportedType(input.type);
    assertQty(market, input.qty);

    // SD-5: seed/mm is liquidity provision only — never take liquidity (no
    // market orders, force post-only so the engine refuses unfair crosses).
    let tif: TimeInForce = input.tif ?? 'GTC';
    if (seeded) {
      if (orderType !== 'limit') {
        throw new TradeError('seed/mm orders must be limit post-only (liquidity provision only)', 'trade.seed_must_make');
      }
      tif = 'PO';
    }
    if (tif === 'PO' && orderType !== 'limit') {
      // Post-only is a promise to be a maker, and only a priced order can make
      // it. Refused here rather than by the engine so no hold is taken first.
      throw new TradeError('post-only requires a limit price', 'trade.invalid_price');
    }

    /**
     * The price the order is FUNDED at, which is not always the price it is
     * matched at:
     *   · limit      — its own price. Fills come in at or better than it.
     *   · market buy — a protection price derived from the best ask, and the
     *                  order is submitted as a marketable IOC limit there, so
     *                  the engine cannot fill above what was held.
     *   · market sell— none needed; the hold is base quantity, exactly.
     */
    let fundingPrice: Amount | null = null;
    let protectionPrice: Amount | null = null;

    if (orderType === 'limit') {
      if (input.price == null) throw new TradeError('a limit order requires a price', 'trade.invalid_price');
      assertPrice(market, input.price);
      assertNotional(market, input.price, input.qty);
      fundingPrice = input.price;
    } else if (input.side === 'buy') {
      protectionPrice = protectionPriceFor(market, await this.bestAsk(market.id), this.slippageCapBps);
      if (input.maxProtectionPrice != null && input.maxProtectionPrice < protectionPrice) {
        if (input.maxProtectionPrice <= 0n) {
          throw new TradeError('maxProtectionPrice must be positive', 'trade.invalid_price');
        }
        protectionPrice = input.maxProtectionPrice;
      }
      assertNotional(market, protectionPrice, input.qty);
      fundingPrice = protectionPrice;
    }

    // A market SELL holds base quantity, so `holdFor` ignores the price on that
    // branch — the zero is never read, and passing one is what keeps the
    // function total rather than partial.
    const hold = holdFor(market, input.side, fundingPrice ?? 0n, input.qty);

    // Rank perks are read ONCE, here, and snapshotted onto the row. Fails
    // closed — but nothing has moved yet, which is exactly why this is the
    // right place to be strict about a dependency being down.
    const perks = await this.perks.perksOf(userId);

    // ── 2b · THE INTENT ROW ─────────────────────────────────────────────────
    //
    // If this crashes exactly here, whose funds are stranded? Nobody's. A
    // `pending` row is an order with no ledger post behind it and no engine
    // presence, so the only correct recovery is to delete it, and that is the
    // only thing it can do.
    //
    // The row comes before the hold so that the hold is never the orphan: a
    // hold posted against an order id that exists nowhere is money nobody can
    // find. This way there is always a row pointing at the money, in every
    // interleaving.
    const orderId = input.clientOrderId ? orderIdFor(userId, market.id, input.clientOrderId) : crypto.randomUUID();

    // THE RETRY. Same client id → same order id → same row → same
    // `order.hold:<orderId>` ledger key. A retry finds the original instead of
    // holding the funds a second time.
    const existing = await this.findOrder(orderId);
    if (existing) return existing;

    const inserted = await this.sql<Array<{ id: string }>>`
      INSERT INTO trade.orders (
        id, user_id, sub_account_id, market_id, client_order_id, side, type,
        price, qty, status, tif, hold_asset, hold_amount, fee_discount_bps, protection_price, seeded
      ) VALUES (
        ${orderId}, ${userId}, ${input.subAccountId ?? null}, ${market.id}, ${input.clientOrderId ?? null},
        ${input.side}, ${orderType},
        ${input.price == null ? null : formatAmount(input.price)}::numeric,
        ${formatAmount(input.qty)}::numeric, 'pending', ${tif},
        ${hold.assetId}, ${formatAmount(hold.amount)}::numeric, ${perks.feeDiscountBps},
        ${protectionPrice === null ? null : formatAmount(protectionPrice)}::numeric,
        ${seeded}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;

    if (inserted.length === 0) {
      // Lost a race with a concurrent identical submission. The winner owns the
      // hold and the engine submission; return what it wrote.
      const raced = await this.findOrder(orderId);
      if (raced) return raced;
      throw new TradeError(`order ${orderId} vanished between insert and read`, 'trade.order_not_found');
    }

    // ── 3 · THE HOLD ────────────────────────────────────────────────────────
    //
    // Quote for buys, base for sells (§5.2). Keyed `order.hold:<orderId>` — a
    // business key, never a random one, so a retry finds the original post.
    try {
      await this.ledger.post(recipes.orderHold({ orderId, userId, assetId: hold.assetId, amount: hold.amount }));
    } catch (err) {
      // Insufficient funds, a frozen module, a ledger outage — whatever it was,
      // no value moved and no engine has seen this order. Remove the intent row
      // so the failure leaves nothing behind at all.
      //
      // Guarded on `status = 'pending'`: if a concurrent path has already
      // funded and opened this order, this delete must not touch it.
      await this.sql`DELETE FROM trade.orders WHERE id = ${orderId} AND status = 'pending'`;
      throw err;
    }

    // The order is now funded. From here on the hold exists, so every exit path
    // below must end in either a fill or a release — never in silence.
    await this.sql`UPDATE trade.orders SET status = 'open', updated_at = now() WHERE id = ${orderId} AND status = 'pending'`;

    // ── 4 · THE ENGINE ──────────────────────────────────────────────────────
    let result: EngineSubmitResult;
    try {
      result = await this.matching.submit(market.id, this.toEngineRequest(orderId, userId, input, orderType, tif, protectionPrice));
    } catch (err) {
      // INDETERMINATE. The request failed at the transport, so the engine may
      // or may not hold this order. The order stays `open` with its hold
      // intact, because releasing funds for an order that might be live in the
      // book is how a fill ends up unfunded — the exact failure this whole
      // ordering exists to prevent. Recovery is a cancel: svc-matching answers
      // 404 for an order it never took, and this service then releases in full.
      throw err;
    }

    await this.applySubmitResult(market, orderId, result);

    const settled = await this.findOrder(orderId);
    if (!settled) throw new TradeError(`order ${orderId} vanished during settlement`, 'trade.order_not_found');
    return settled;
  }

  /**
   * Paper market place — Stage-1 isolation.
   *
   * Records an intent/open order with zero hold and never calls the ledger.
   * Simulated fills / workbook wiring are Stage-2. Live placeOrder path is
   * unchanged for non-paper markets.
   */
  private async placePaperOrderIsolated(principal: Principal, input: PlaceOrderInput, market: Market): Promise<OrderRecord> {
    requireScope(principal, 'trade:write');
    const userId = principal.userId;
    if (input.subAccountId != null) {
      await assertSubAccountOwned(this.subAccounts, userId, input.subAccountId);
    }
    assertMarketOpen(market, this.now());
    const orderType: OrderType = requireSupportedType(input.type);
    assertQty(market, input.qty);
    if (orderType === 'limit') {
      if (input.price == null) throw new TradeError('a limit order requires a price', 'trade.invalid_price');
      assertPrice(market, input.price);
      assertNotional(market, input.price, input.qty);
    }
    const tif: TimeInForce = input.tif ?? 'GTC';
    // Schema requires hold columns; paper posts zero amount and never ledger-posts.
    const holdAsset = input.side === 'buy' ? market.quoteAsset : market.baseAsset;
    const orderId = input.clientOrderId ? orderIdFor(userId, market.id, input.clientOrderId) : crypto.randomUUID();
    const existing = await this.findOrder(orderId);
    if (existing) return existing;

    const inserted = await this.sql<Array<{ id: string }>>`
      INSERT INTO trade.orders (
        id, user_id, sub_account_id, market_id, client_order_id, side, type,
        price, qty, status, tif, hold_asset, hold_amount, fee_discount_bps, protection_price, seeded
      ) VALUES (
        ${orderId}, ${userId}, ${input.subAccountId ?? null}, ${market.id}, ${input.clientOrderId ?? null},
        ${input.side}, ${orderType},
        ${input.price == null ? null : formatAmount(input.price)}::numeric,
        ${formatAmount(input.qty)}::numeric, 'open', ${tif},
        ${holdAsset}, ${formatAmount(0n)}::numeric, 0,
        null,
        false
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    if (inserted.length === 0) {
      const raced = await this.findOrder(orderId);
      if (raced) return raced;
      throw new TradeError(`order ${orderId} vanished between insert and read`, 'trade.order_not_found');
    }
    // No ledger.post. No matching.submit. Paper residual for Stage-2 fills.
    const settled = await this.findOrder(orderId);
    if (!settled) throw new TradeError(`order ${orderId} vanished during paper place`, 'trade.order_not_found');
    await this.publishOrderUpdated(settled);
    return settled;
  }

  /**
   * Cancel an open order and return what is left of its hold (§5.2 step 3).
   *
   * ORDERING: the engine first, this service second. Cancelling at the engine
   * is what makes "no further fills for this order" true; only once it is true
   * can the remainder be computed and released. Releasing first would race a
   * fill that is already in flight, and the release would draw down a hold that
   * a fill is about to need.
   */
  async cancelOrder(principal: Principal, orderId: string): Promise<OrderRecord> {
    return withMoneySpan('trade.cancelOrder', { operation: 'cancel_order', userId: principal.userId, orderId }, async () => {
      requireScope(principal, 'trade:write');

      const order = await this.findOrder(orderId);
      if (!order) throw new TradeError(`order ${orderId} not found`, 'trade.order_not_found');
      if (order.userId !== principal.userId) {
        // Deliberately the same code a stranger's order id would produce — do
        // not confirm the existence of another account's order.
        throw new TradeError(`order ${orderId} not found`, 'trade.order_not_found');
      }
      if (order.status !== 'open' && order.status !== 'pending') {
        throw new TradeError(`order ${orderId} is ${order.status} and cannot be cancelled`, 'trade.order_not_open');
      }

      // `cancelled: false` means the engine has no such live order — it already
      // filled, or it never arrived (the indeterminate-submit case above).
      // Either way the hold still has to be reconciled, so the answer is the
      // same and this is not an error path.
      await this.matching.cancel(order.marketId, orderId);
      await this.finalize(orderId, 'cancelled');

      const settled = await this.findOrder(orderId);
      return settled as OrderRecord;
    });
  }

  /**
   * Cancel every open/pending order for the principal (optional market filter).
   * Sequential on purpose: each cancel is its own hold-release money path.
   */
  async cancelAllOrders(principal: Principal, marketId?: string): Promise<OrderRecord[]> {
    requireScope(principal, 'trade:write');
    const open = await this.openOrders(principal, marketId);
    const out: OrderRecord[] = [];
    for (const order of open) {
      out.push(await this.cancelOrder(principal, order.id));
    }
    return out;
  }

  // ── Applying what the engine said ─────────────────────────────────────────

  private async applySubmitResult(market: Market, orderId: string, result: EngineSubmitResult): Promise<void> {
    if (!result.accepted) {
      // A rejection is a valid answer, not a fault: post-only refusing to cross
      // is the feature working. The order never touched the book, so the whole
      // hold comes straight back.
      //
      // The reject code is recorded first because it carries no money; the
      // release and the terminal status are done together by `finalize`, in
      // that order, for the reason spelled out there.
      await this.sql`
        UPDATE trade.orders SET reject_code = ${result.rejected?.code ?? 'rejected'}, updated_at = now() WHERE id = ${orderId}
      `;
      await this.finalize(orderId, 'rejected');
      return;
    }

    if (result.sequence !== null) {
      await this.sql`UPDATE trade.orders SET engine_sequence = ${result.sequence}, updated_at = now() WHERE id = ${orderId}`;
    }

    // A triggered stop cannot occur while this service refuses stop orders, but
    // the outcome is flattened rather than ignored: if the engine ever reports
    // one, the fills and cancellations inside it settle exactly like any other,
    // instead of being silently dropped along with somebody's money.
    const fills: EngineFill[] = [...result.fills];
    const cancellations: EngineCancellation[] = [...result.cancellations];
    for (const triggered of result.triggered) {
      fills.push(...triggered.fills);
      cancellations.push(...triggered.cancellations);
    }

    await this.settleOutcome(market, fills, cancellations);

    // The submitted order rested with a remainder → it stays open, holding the
    // rest of its funds. It did not rest → it is done, and whatever is left of
    // the hold goes back now rather than at some future sweep.
    if (result.resting === null || result.resting.orderId !== orderId) {
      await this.finalizeIfComplete(orderId);
    }
  }

  /**
   * Settle one submission's fills and cancellations, in that order.
   *
   * Fills first, always. A cancellation releases `hold - consumed`, and
   * `consumed` is derived from the fills table — so releasing before the fills
   * are recorded would hand back money a fill is about to spend.
   */
  private async settleOutcome(market: Market, fills: readonly EngineFill[], cancellations: readonly EngineCancellation[]): Promise<void> {
    const touched = new Set<string>();

    for (const fill of [...fills].sort((a, b) => a.sequence - b.sequence)) {
      await this.settleFill(market, fill);
      touched.add(fill.makerOrderId);
      touched.add(fill.takerOrderId);
    }

    // An IOC remainder, a market remainder, or a resting order pulled by
    // self-trade prevention. §5.1 unifies them because this service does the
    // same thing with all three: the order is done, release what is left.
    for (const cancellation of cancellations) {
      await this.finalize(cancellation.orderId, 'cancelled');
      touched.delete(cancellation.orderId);
    }

    // A maker that filled completely leaves the book without a cancellation —
    // it simply is not there any more. It still has a hold to close out: a buy
    // was funded at `ceil(price x qty)` and consumed `sum(floor(price x qty_i))`,
    // so a wei of rounding can be left behind. Left behind is exactly what it
    // must not be.
    for (const id of touched) await this.finalizeIfComplete(id);
  }

  /**
   * Turn one match into one `tradeFill` ledger transaction (§5.2 step 3).
   *
   * ORDERING — the rows are committed BEFORE the ledger post, which is the
   * opposite of the order svc-token uses for a stake, and deliberately so. The
   * amount still owed back to a user is derived as `hold - Σ fills`, so:
   *
   *   · rows first  → the fills table can only ever be AHEAD of the ledger, so
   *                   `consumed` is never understated, so a release is never
   *                   overstated. Worst case a fill is recorded but unsettled:
   *                   the funds stay in `hold`, nothing is lost, and re-running
   *                   this method re-posts the same idempotency key and heals it.
   *   · ledger first→ a crash before the row is written understates `consumed`,
   *                   and the next release hands back money this fill already
   *                   spent — drawn out of whatever else that user has in
   *                   `hold`. That is one order silently paying for another.
   *
   * Idempotent at both layers: the ledger key is `trade.fill:<fillId>` where
   * `fillId` derives from (market, engine sequence), and the unique index on
   * (market, sequence, liquidity) makes a second row impossible.
   */
  /**
   * Write one leg of a fill, and decide what a collision MEANS before absorbing it.
   *
   * ── The gap this closes ──────────────────────────────────────────────────
   *
   * `trade.fills` carries TWO unique keys: `fills_pkey` on `id`, and
   * `fills_market_sequence_role_idx` on `(market_id, sequence, liquidity)`. The
   * insert arbitrated on `id` only. Postgres applies `ON CONFLICT` to the named
   * arbiter and to nothing else, so a row that cleared the primary key and then
   * collided on the sequence index raised a bare 23505 — surfacing to the
   * caller as a 500 with a Postgres string in it, and to CI as an intermittent
   * CX-8 failure that a re-run makes disappear.
   *
   * ── Why this is not just a wider ON CONFLICT ─────────────────────────────
   *
   * Widening to `ON CONFLICT DO NOTHING` would make the symptom vanish, and
   * that is exactly why it is wrong. The two ways to reach this collision want
   * OPPOSITE handling:
   *
   *   · REDELIVERY — the same match settled twice (JetStream redelivery, a
   *     retried submission, an operator replaying a day). `fillLegIdFor` is
   *     derived from `(market, sequence, role)`, so the same match always
   *     computes the same id and the same row. Nothing to do: the row is
   *     already correct and the ledger post below is idempotent on
   *     `trade.fill:<fillId>`. Absorb it silently.
   *
   *   · SEQUENCE REUSE — a DIFFERENT match claimed a `(market, sequence)` that
   *     is already spoken for. `OrderBook.sequence` is an in-memory counter
   *     that starts at 0 and is rebuilt by journal replay, so a book restored
   *     without its journal while `trade.fills` still holds the old rows hands
   *     the same sequence to a new trade. That is not a duplicate — it is the
   *     ledger's `trade.fill:<fillId>` key aliasing two different trades onto
   *     one transaction, and the second one silently never settling.
   *
   * Swallowing the second case is worse than the 500 it replaces: a 500 is at
   * least visible. So the row is read back and compared, and only a byte-equal
   * match is treated as a redelivery.
   *
   * The comparison is on the money-bearing columns — price, qty, quote amount,
   * fee — plus both order ids and the owner. `ts`/`created_at` are excluded:
   * they differ between the original write and a replay by construction, and
   * comparing them would turn every legitimate redelivery into an incident.
   */
  private async insertFillLeg(leg: {
    id: string;
    orderId: string;
    counterOrderId: string;
    marketId: string;
    symbol: string;
    userId: string;
    side: 'buy' | 'sell';
    role: 'maker' | 'taker';
    price: bigint;
    qty: bigint;
    quoteAmount: bigint;
    feeAsset: string;
    feeAmount: bigint;
    feeBps: number;
    sequence: number;
  }): Promise<void> {
    let inserted: Array<{ id: string }>;
    try {
      inserted = await this.sql<Array<{ id: string }>>`
        INSERT INTO trade.fills (
          id, order_id, counter_order_id, market_id, user_id, side, liquidity,
          price, qty, quote_amount, fee_asset, fee_amount, fee_bps, sequence
        ) VALUES (
          ${leg.id}, ${leg.orderId}, ${leg.counterOrderId},
          ${leg.marketId}, ${leg.userId}, ${leg.side}, ${leg.role},
          ${formatAmount(leg.price)}::numeric, ${formatAmount(leg.qty)}::numeric, ${formatAmount(leg.quoteAmount)}::numeric,
          ${leg.feeAsset}, ${formatAmount(leg.feeAmount)}::numeric, ${leg.feeBps}, ${leg.sequence}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;
    } catch (err) {
      /**
       * `ON CONFLICT (id)` names ONE arbiter, and Postgres applies the DO
       * NOTHING to that index alone. A row that clears `fills_pkey` and then
       * collides on `fills_market_sequence_role_idx` therefore RAISES rather
       * than returning zero rows — which is the whole bug: it left the caller
       * with a 500 carrying a Postgres string.
       *
       * Catching only 23505 (unique_violation). Anything else — a foreign key
       * to a deleted order, a CHECK on a negative amount — is a different
       * failure and must not be quietly re-interpreted as an idempotency
       * question.
       */
      if ((err as { code?: string })?.code !== '23505') throw err;
      inserted = [];
    }

    // Inserted, or the id already held this exact row. Either way we are done —
    // the id IS the business key, so an id collision cannot be a different fill.
    if (inserted.length > 0) return;

    /**
     * Nothing inserted. Two sub-cases, and only one of them is benign.
     *
     * The id conflict path is the ordinary redelivery and needs no read: the id
     * is derived from the same three columns the sequence index covers, so a
     * row holding this id necessarily holds this `(market, sequence, role)`.
     * Read it back anyway — cheaply, once, off the happy path — because the
     * whole point of this method is to stop assuming which conflict fired.
     */
    const [existing] = await this.sql<Array<FillRow>>`
      SELECT * FROM trade.fills
      WHERE market_id = ${leg.marketId} AND sequence = ${leg.sequence} AND liquidity = ${leg.role}
      LIMIT 1
    `;

    if (!existing) {
      // The insert did nothing and no row is there. A concurrent transaction
      // holds it uncommitted, or something outside this service deleted it.
      // Either way this settle has not happened and must not report success.
      throw new TradeError(
        `fill ${leg.sequence} on ${leg.symbol} (${leg.role}) neither inserted nor found — a concurrent writer holds it uncommitted`,
        'trade.fill_sequence_conflict',
      );
    }

    const same =
      existing.id === leg.id &&
      existing.order_id === leg.orderId &&
      existing.counter_order_id === leg.counterOrderId &&
      existing.user_id === leg.userId &&
      parseAmount(existing.price) === leg.price &&
      parseAmount(existing.qty) === leg.qty &&
      parseAmount(existing.quote_amount) === leg.quoteAmount &&
      parseAmount(existing.fee_amount) === leg.feeAmount &&
      existing.fee_asset === leg.feeAsset;

    // The ordinary case: this match already settled. The ledger post that
    // follows is keyed on `trade.fill:<fillId>` and returns the original
    // transaction, so continuing is a no-op rather than a second movement.
    if (same) return;

    /**
     * A DIFFERENT trade already owns this sequence.
     *
     * Refusing is the only safe answer. Writing under a new id would leave the
     * ledger key `trade.fill:<market>:<sequence>` pointing at whichever trade
     * settled first, and the second trade's money would never move while its
     * fill row claimed it had. The order fails, the hold stays intact, and the
     * name says what to investigate.
     */
    throw new TradeError(
      `fill sequence ${leg.sequence} on ${leg.symbol} (${leg.role}) is already held by a DIFFERENT match ` +
        `(stored fill ${existing.id} for order ${existing.order_id}; this match is ${leg.id} for order ${leg.orderId}). ` +
        `The engine's sequence counter has been reused — a book was almost certainly restored without its journal. ` +
        `Settling would alias two trades onto one ledger idempotency key.`,
      'trade.fill_sequence_conflict',
    );
  }

  private async settleFill(market: Market, fill: EngineFill): Promise<void> {
    const qty = parseAmount(fill.qty);
    const price = parseAmount(fill.price);

    /**
     * FLOORED, and it has to be. The buy side was funded at `ceil(price x qty)`
     * for the whole order; a sum of floored parts can never exceed the ceiling
     * of the whole, so a partially filled order can never consume more hold
     * than it was given. Ceiling the parts could, by one wei per fill, and one
     * wei short at settlement is a fill the ledger refuses to post.
     */
    const quoteAmount = mul(price, qty, 'floor');
    if (quoteAmount <= 0n) {
      // The market's tick x lot grid is supposed to make this unreachable, and
      // the database has a CHECK saying so. If it happens anyway the listing is
      // wrong, and settling it is impossible — the ledger will not post a
      // movement of nothing.
      throw new TradeError(
        `fill ${fill.sequence} on ${market.symbol} has a zero quote amount — check the market's tick and lot sizes`,
        'trade.dust_fill',
      );
    }

    const maker = await this.findOrder(fill.makerOrderId);
    const taker = await this.findOrder(fill.takerOrderId);
    const makerIsHouseMm = isHouseMmAccount(fill.makerAccountId);

    // House MM seed orders are not in trade.orders (seedMarket holds + matching
    // only). User taker must still exist. MM-as-taker is residual.
    if (!taker) {
      throw new TradeError(
        `fill ${fill.sequence} references an order this service does not know (${fill.makerOrderId} / ${fill.takerOrderId})`,
        'trade.order_not_found',
      );
    }
    if (!maker && !makerIsHouseMm) {
      throw new TradeError(
        `fill ${fill.sequence} references an order this service does not know (${fill.makerOrderId} / ${fill.takerOrderId})`,
        'trade.order_not_found',
      );
    }

    // ── House MM maker path (trade.mm-bot) ──────────────────────────────────
    // Route by identity, not "order row missing". A prior partial fill inserts a
    // stub trade.orders row; the next match must still use marketMakerMakerFill
    // (MM pot holds), never user tradeFill against HOUSE_MM_USER_UUID.
    const makerIsHouseMmRow = maker != null && maker.userId === HOUSE_MM_USER_UUID;
    if (makerIsHouseMm || makerIsHouseMmRow) {
      const rates = ratesForFill(market, 0, taker.feeDiscountBps);
      const takerBuys = fill.takerSide === 'buy';
      // BEFORE any fill row: fee-equal-to-receivable is permanently unpostable
      // (recipe throws; re-run throws). Inserting first left remainingHold
      // overstated forever — README recovery claim was false for this class.
      this.assertFillFeesPostable(fill.sequence, market.symbol, fill.takerSide, qty, quoteAmount, rates);
      const takerFee = mulBps(takerBuys ? qty : quoteAmount, rates.takerFeeBps);
      const makerFee = mulBps(takerBuys ? quoteAmount : qty, rates.makerFeeBps);
      const makerSide = takerBuys ? ('sell' as const) : ('buy' as const);
      const makerFeeAsset = takerBuys ? market.quoteAsset : market.baseAsset;
      const takerFeeAsset = takerBuys ? market.baseAsset : market.quoteAsset;
      // fills.order_id FK → trade.orders. Seed path never wrote a row; insert a
      // bookkeeping stub. Hold value lives on MM ledger pots; row hold_amount
      // is the fill notional (orders_hold_positive_ck) for this match only.
      // seeded=true so public tape / candles exclude house MM prints (SD-3).
      const makerHoldAsset = takerBuys ? market.baseAsset : market.quoteAsset;
      const makerHoldAmount = takerBuys ? qty : quoteAmount;
      await this.sql`
        INSERT INTO trade.orders (
          id, user_id, market_id, side, type, price, qty, status, tif,
          hold_asset, hold_amount, fee_discount_bps, seeded
        ) VALUES (
          ${fill.makerOrderId}, ${HOUSE_MM_USER_UUID}, ${market.id}, ${makerSide}, ${'limit'},
          ${formatAmount(price)}::numeric, ${formatAmount(qty)}::numeric, ${'open'}, ${'PO'},
          ${makerHoldAsset}, ${formatAmount(makerHoldAmount)}::numeric, ${0}, ${true}
        )
        ON CONFLICT (id) DO NOTHING
      `;

      // Same guard as the classic path below: a sequence already owned by a
      // different match must refuse, not silently no-op. The MM pot is still
      // real money.
      await this.insertFillLeg({
        id: fillLegIdFor(market.id, fill.sequence, 'maker'),
        orderId: fill.makerOrderId,
        counterOrderId: taker.id,
        marketId: market.id,
        symbol: market.symbol,
        userId: HOUSE_MM_USER_UUID,
        side: makerSide,
        role: 'maker',
        price,
        qty,
        quoteAmount,
        feeAsset: makerFeeAsset,
        feeAmount: makerFee,
        feeBps: rates.makerFeeBps,
        sequence: fill.sequence,
      });
      await this.insertFillLeg({
        id: fillLegIdFor(market.id, fill.sequence, 'taker'),
        orderId: taker.id,
        counterOrderId: fill.makerOrderId,
        marketId: market.id,
        symbol: market.symbol,
        userId: taker.userId,
        side: fill.takerSide,
        role: 'taker',
        price,
        qty,
        quoteAmount,
        feeAsset: takerFeeAsset,
        feeAmount: takerFee,
        feeBps: rates.takerFeeBps,
        sequence: fill.sequence,
      });

      await this.refreshFilledQty(taker.id);

      await this.ledger.post(
        recipes.marketMakerMakerFill({
          fillId: fillIdFor(market.id, fill.sequence),
          takerId: taker.userId,
          makerOrderId: fill.makerOrderId,
          takerOrderId: taker.id,
          baseAsset: market.baseAsset,
          quoteAsset: market.quoteAsset,
          qty,
          quoteAmount,
          takerSide: fill.takerSide,
          makerFeeBps: rates.makerFeeBps,
          takerFeeBps: rates.takerFeeBps,
        }),
      );

      await this.bus.publish(
        'fillSettled',
        {
          fillId: fillLegIdFor(market.id, fill.sequence, 'taker'),
          orderId: taker.id,
          userId: taker.userId,
          marketId: market.id,
          side: fill.takerSide,
          liquidity: 'taker',
          price: formatAmount(price),
          qty: formatAmount(qty),
          quoteAmount: formatAmount(quoteAmount),
          feeAsset: takerFeeAsset,
          feeAmount: formatAmount(takerFee),
          feeBps: rates.takerFeeBps,
          sequence: fill.sequence,
          ts: new Date().toISOString(),
        },
        { idempotencyKey: `trade.fill.settled:${market.id}:${fill.sequence}:taker` },
      );
      const latest = await this.findOrder(taker.id);
      if (latest) await this.publishOrderUpdated(latest);
      return;
    }

    // Both user orders — classic path.
    if (!maker) {
      throw new TradeError(
        `fill ${fill.sequence} references an order this service does not know (${fill.makerOrderId} / ${fill.takerOrderId})`,
        'trade.order_not_found',
      );
    }

    // Both rates in one place: `tradeFill` posts them in one six-entry
    // transaction, and resolving them apart would let one side's rounding drift
    // from the other's without anything failing.
    const rates = ratesForFill(market, maker.feeDiscountBps, taker.feeDiscountBps);

    const takerBuys = fill.takerSide === 'buy';
    // BEFORE fill rows: same fee-exhaust guard as the MM path above. Recipe
    // layer already refuses; without this the fills table permanently outruns
    // the ledger and release understates remainder.
    this.assertFillFeesPostable(fill.sequence, market.symbol, fill.takerSide, qty, quoteAmount, rates);
    // Each side's fee comes out of what that side RECEIVES (see `tradeFill`).
    const takerFee = mulBps(takerBuys ? qty : quoteAmount, rates.takerFeeBps);
    const makerFee = mulBps(takerBuys ? quoteAmount : qty, rates.makerFeeBps);

    const legs = [
      {
        role: 'maker' as const,
        order: maker,
        counterOrderId: taker.id,
        side: takerBuys ? ('sell' as const) : ('buy' as const),
        feeAsset: takerBuys ? market.quoteAsset : market.baseAsset,
        feeAmount: makerFee,
        feeBps: rates.makerFeeBps,
      },
      {
        role: 'taker' as const,
        order: taker,
        counterOrderId: maker.id,
        side: fill.takerSide,
        feeAsset: takerBuys ? market.baseAsset : market.quoteAsset,
        feeAmount: takerFee,
        feeBps: rates.takerFeeBps,
      },
    ];

    // Conflict on deterministic fill id (market+seq+role). Concurrent inline
    // settle + NATS redelivery must not 500 on fills_pkey — that broke CX-8 L3.
    for (const leg of legs) {
      await this.insertFillLeg({
        id: fillLegIdFor(market.id, fill.sequence, leg.role),
        orderId: leg.order.id,
        counterOrderId: leg.counterOrderId,
        marketId: market.id,
        symbol: market.symbol,
        userId: leg.order.userId,
        side: leg.side,
        role: leg.role,
        price,
        qty,
        quoteAmount,
        feeAsset: leg.feeAsset,
        feeAmount: leg.feeAmount,
        feeBps: leg.feeBps,
        sequence: fill.sequence,
      });
    }

    // Recomputed from the fills rather than incremented, so it is idempotent by
    // construction and `filled_qty = Σ fills.qty` is true by definition rather
    // than by hope. A test asserts it anyway.
    for (const leg of legs) await this.refreshFilledQty(leg.order.id);

    // ── 5 · THE FILL ────────────────────────────────────────────────────────
    //
    // The six-entry atomic fill. Both sides' holds are drawn down and both
    // sides' fees land in `houseFees('trade', …)` in one transaction, so there
    // is no interleaving in which one side has paid and the other has not.
    await this.ledger.post(
      recipes.tradeFill({
        fillId: fillIdFor(market.id, fill.sequence),
        makerId: maker.userId,
        takerId: taker.userId,
        // P0-3: name whose reservation each side is spending. These come from
        // the order store — this service's source of truth for a fill (see the
        // P0-2 ADR) — not from the engine event, which carries neither.
        makerOrderId: maker.id,
        takerOrderId: taker.id,
        baseAsset: market.baseAsset,
        quoteAsset: market.quoteAsset,
        qty,
        quoteAmount,
        takerSide: fill.takerSide,
        makerFeeBps: rates.makerFeeBps,
        takerFeeBps: rates.takerFeeBps,
      }),
    );

    // User-visible fill + order snapshots for private WS (not money — ledger already moved).
    for (const leg of legs) {
      await this.bus.publish(
        'fillSettled',
        {
          fillId: fillLegIdFor(market.id, fill.sequence, leg.role),
          orderId: leg.order.id,
          userId: leg.order.userId,
          marketId: market.id,
          side: leg.side,
          liquidity: leg.role,
          price: formatAmount(price),
          qty: formatAmount(qty),
          quoteAmount: formatAmount(quoteAmount),
          feeAsset: leg.feeAsset,
          feeAmount: formatAmount(leg.feeAmount),
          feeBps: leg.feeBps,
          sequence: fill.sequence,
          ts: new Date().toISOString(),
        },
        { idempotencyKey: `trade.fill.settled:${market.id}:${fill.sequence}:${leg.role}` },
      );
      const latest = await this.findOrder(leg.order.id);
      if (latest) await this.publishOrderUpdated(latest);
    }
  }

  // ── Holds: the only two things that can happen to one ─────────────────────

  /**
   * Refuse a match whose fees leave a side with nothing — BEFORE fill rows.
   *
   * `tradeFill` already throws `InvalidEntryError` for this class, but it runs
   * after the insert. Re-running then re-throws forever while `remainingHold`
   * treats the unposted fill as consumed. Checking here keeps the fills table
   * from outrunning the ledger when the post cannot heal.
   */
  private assertFillFeesPostable(
    sequence: number,
    symbol: string,
    takerSide: 'buy' | 'sell',
    qty: Amount,
    quoteAmount: Amount,
    rates: { makerFeeBps: number; takerFeeBps: number },
  ): void {
    const pays = fillPayAmounts({ takerSide, qty, quoteAmount });
    if (
      fillReceivablesSurviveFees({
        ...pays,
        makerFeeBps: rates.makerFeeBps,
        takerFeeBps: rates.takerFeeBps,
      })
    ) {
      return;
    }
    throw new TradeError(
      `fill ${sequence} on ${symbol} would leave a side with nothing after fees ` +
        `(maker ${rates.makerFeeBps} bps / taker ${rates.takerFeeBps} bps) — refuse before recording the fill`,
      'trade.fee_exceeds_fill',
    );
  }

  /**
   * How much of an order's hold has NOT been spent by its fills.
   *
   * Derived, never stored. `hold_amount` is written once and the fills are the
   * only other input, so this number cannot drift — there is no third place
   * keeping a running total that could disagree with the other two.
   */
  private async remainingHold(sql: Sql, order: OrderRecord): Promise<Amount> {
    // A buy consumed quote, a sell consumed base. Expressed as a CASE over a
    // bound parameter rather than a dynamic column name: the two are the same
    // query plan, and this one cannot be turned into an injection by a future
    // edit that forgets where `side` came from.
    const rows = await sql<Array<{ consumed: string }>>`
      SELECT COALESCE(SUM(CASE WHEN ${order.side === 'buy'} THEN quote_amount ELSE qty END), 0) AS consumed
        FROM trade.fills WHERE order_id = ${order.id}
    `;
    const consumed = parseAmount(rows[0]?.consumed ?? '0');
    const remaining = sub(order.holdAmount, consumed);

    if (remaining < 0n) {
      // The fills say this order spent more than it was funded for. That is not
      // a rounding question: either the engine matched an order it should not
      // have, or a fill was recorded twice. Refuse to guess — releasing a
      // negative would draw down whatever else this user has in `hold`, which
      // is another order's money.
      throw new TradeError(
        `order ${order.id} consumed ${formatAmount(consumed)} against a ${formatAmount(order.holdAmount)} hold`,
        'trade.hold_uncovered',
      );
    }

    return remaining;
  }

  /**
   * Move an order to a terminal state and give back what is left of its hold.
   *
   * THE RELEASE HAPPENS BEFORE THE STATUS CHANGE, and that ordering is the
   * answer to "if this crashes exactly here, whose funds are stranded?".
   * Terminal status is what makes this method return early, so setting it first
   * and crashing before the release would strand the remainder behind a row
   * that says there is nothing to do. This way a crash leaves a non-terminal
   * row, a retry recomputes the same remainder, and the ledger's
   * `order.release:<orderId>:0` key makes the second post a no-op.
   *
   * ONE RELEASE PER ORDER, EVER — sequence 0, fixed. An order reaches a
   * terminal state exactly once, so the key never needs to vary, and a fixed
   * key is what makes a double-release impossible rather than merely unlikely.
   * This is the bug the "partial fill then cancel" test exists to catch: the
   * remainder is `hold - Σ fills`, so the filled part is never released and the
   * unfilled part is never released twice.
   */
  private async finalize(orderId: string, status: Extract<OrderStatus, 'cancelled' | 'filled' | 'expired' | 'rejected'>): Promise<void> {
    const outcome = await transaction(
      this.sql,
      async (tx): Promise<{ order: OrderRecord; status: OrderStatus } | null> => {
        const rows = await tx<OrderRow[]>`SELECT * FROM trade.orders WHERE id = ${orderId} FOR UPDATE`;
        const row = rows[0];
        if (!row) return null;

        const order = toOrder(row);
        if (order.status !== 'open' && order.status !== 'pending') return null;

        const remaining = await this.remainingHold(tx, order);
        if (remaining > 0n) {
          // ── 6 · THE RELEASE ────────────────────────────────────────────────
          await this.ledger.post(
            recipes.orderHoldRelease({
              orderId,
              userId: order.userId,
              assetId: order.holdAsset,
              amount: remaining,
              sequence: 0,
            }),
          );
        }

        const finalStatus: OrderStatus = order.filledQty > 0n && order.filledQty >= order.qty ? 'filled' : status;
        await tx`UPDATE trade.orders SET status = ${finalStatus}, updated_at = now() WHERE id = ${orderId}`;

        return { order, status: finalStatus };
      },
      { isolation: 'read committed', maxAttempts: 5 },
    );

    // Published outside the transaction. An XP award is not money and must not
    // be able to roll back a release, nor hold a database transaction open
    // across a broker round trip.
    if (outcome) {
      const latest = (await this.findOrder(orderId)) ?? { ...outcome.order, status: outcome.status };
      await this.publishOrderUpdated({ ...latest, status: outcome.status });
      if (outcome.order.filledQty > 0n) await this.publishXp(outcome.order, outcome.status);
    }
  }

  /** Close out an order that filled completely — no cancellation is emitted for one. */
  private async finalizeIfComplete(orderId: string): Promise<void> {
    const order = await this.findOrder(orderId);
    if (!order) return;
    if (order.status !== 'open' && order.status !== 'pending') return;
    if (order.filledQty < order.qty) return;
    await this.finalize(orderId, 'filled');
  }

  // ── Events ────────────────────────────────────────────────────────────────

  /**
   * §5.2 step 4: "XP event emitted per filled order."
   *
   * Emitted once, at the terminal transition, keyed on the order id so a
   * redelivery cannot pay the same achievement twice. svc-identity is the only
   * writer of rank state (§4.1) — this service says what happened and has no
   * opinion about what it is worth.
   *
   * SOCKET §13 — volume-weighted XP and rolling fee tiers. §5.2 also asks for
   * "volume aggregates per user per window [to] feed rank + fee-tier". That is
   * a windowed aggregation job over `fills`, which needs a window table and a
   * schedule of its own; the fills it would read are all written here already.
   */
  private async publishXp(order: OrderRecord, status: OrderStatus): Promise<void> {
    await this.bus.publish(
      'xpEarned',
      {
        userId: order.userId,
        sourceModule: 'trade',
        action: status === 'filled' ? 'order.filled' : 'order.partially_filled',
        xpDelta: status === 'filled' ? 10 : 5,
        meta: { orderId: order.id, marketId: order.marketId },
      },
      { idempotencyKey: `trade.order.xp:${order.id}` },
    );
  }

  /**
   * Private order stream feed. Not a money path — the ledger already moved.
   * Keyed on (order, status, filledQty) so redelivery of the same snapshot is
   * a bus no-op while a fill that advances filledQty still ships.
   */
  private async publishOrderUpdated(order: OrderRecord): Promise<void> {
    await this.bus.publish(
      'orderUpdated',
      {
        orderId: order.id,
        userId: order.userId,
        marketId: order.marketId,
        status: order.status,
        side: order.side,
        type: order.type,
        qty: formatAmount(order.qty),
        filledQty: formatAmount(order.filledQty),
        price: order.price == null ? null : formatAmount(order.price),
        clientOrderId: order.clientOrderId,
        ts: new Date().toISOString(),
      },
      { idempotencyKey: `trade.order.updated:${order.id}:${order.status}:${formatAmount(order.filledQty)}` },
    );
  }

  /**
   * Settle a fill that arrived as an event rather than in a submit response.
   *
   * The recovery path. svc-matching publishes every match to
   * `intafaced.matching.order.filled` regardless of who submitted it, so a
   * process that died between the engine printing a fill and this service
   * settling it heals when the event is delivered. Every step is keyed on
   * (market, engine sequence), so this and the inline path cannot double-settle
   * each other.
   *
   * `makerAccountId` / `takerAccountId` come from the matching event when the
   * catalog carries them. House MM seed makers have no `trade.orders` row and
   * are identified only by matching STP id `house:market-maker` — empty string
   * must not invent that path. User makers may fall back to the order row's
   * userId (matching uses user id as accountId for users).
   */
  async settleFillEvent(input: {
    marketId: string;
    makerOrderId: string;
    takerOrderId: string;
    price: string;
    qty: string;
    sequence: number;
    /** Matching STP account for the maker leg — required for house MM recovery. */
    makerAccountId?: string;
    /** Matching STP account for the taker leg (users: userId). */
    takerAccountId?: string;
  }): Promise<void> {
    const market = await this.marketById(input.marketId);
    if (!market) throw new TradeError(`market ${input.marketId} not found`, 'trade.market_not_found');

    const taker = await this.findOrder(input.takerOrderId);
    if (!taker) throw new TradeError(`order ${input.takerOrderId} not found`, 'trade.order_not_found');

    // Prefer event payload; then orders table for user legs. Never invent house MM.
    const makerRow = await this.findOrder(input.makerOrderId);
    const makerAccountId = (input.makerAccountId && input.makerAccountId.trim()) || (makerRow ? makerRow.userId : '') || '';
    const takerAccountId = (input.takerAccountId && input.takerAccountId.trim()) || taker.userId;

    await withMoneySpan(
      'trade.settleFillEvent',
      { operation: 'settle_fill', marketId: input.marketId, symbol: market.symbol, qty: input.qty },
      async () => {
        await this.settleFill(market, {
          sequence: input.sequence,
          makerOrderId: input.makerOrderId,
          makerAccountId,
          takerOrderId: input.takerOrderId,
          takerAccountId,
          takerSide: taker.side,
          price: input.price,
          qty: input.qty,
        });
        await this.finalizeIfComplete(input.makerOrderId);
        await this.finalizeIfComplete(input.takerOrderId);
      },
    );
  }

  /**
   * Release the hold for an order the engine says has left the book.
   *
   * The other half of the recovery path. Idempotent: `finalize` returns
   * immediately for an order already in a terminal state, and the release key
   * is fixed per order, so a redelivered `order.cancelled` cannot release
   * twice.
   */
  async releaseOnCancelEvent(orderId: string): Promise<void> {
    await withMoneySpan('trade.releaseOnCancelEvent', { operation: 'release_hold', orderId }, async () => {
      await this.finalize(orderId, 'cancelled');
    });
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async getOrder(principal: Principal, orderId: string): Promise<OrderRecord> {
    requireScope(principal, 'trade:read');
    const order = await this.findOrder(orderId);
    if (!order || order.userId !== principal.userId) {
      throw new TradeError(`order ${orderId} not found`, 'trade.order_not_found');
    }
    return order;
  }

  async openOrders(principal: Principal, marketId?: string): Promise<OrderRecord[]> {
    requireScope(principal, 'trade:read');
    const rows = marketId
      ? await this.sql<OrderRow[]>`
          SELECT * FROM trade.orders
           WHERE user_id = ${principal.userId} AND status IN ('pending', 'open') AND market_id = ${marketId}
           ORDER BY created_at DESC
        `
      : await this.sql<OrderRow[]>`
          SELECT * FROM trade.orders
           WHERE user_id = ${principal.userId} AND status IN ('pending', 'open')
           ORDER BY created_at DESC
        `;
    return rows.map(toOrder);
  }

  /**
   * Terminal orders for the principal (filled / cancelled / rejected / expired).
   * Optional `sinceMs` (unix ms) is applied in SQL on `orders.created_at >= since`
   * (CCXT convention). `created_at` is timestamptz — convert ms via `Date`.
   */
  async orderHistory(principal: Principal, input: { marketId?: string; limit?: number; sinceMs?: number } = {}): Promise<OrderRecord[]> {
    requireScope(principal, 'trade:read');
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
    // timestamptz compare: Date carries ms precision into postgres.js.
    const sinceDate = input.sinceMs !== undefined ? new Date(input.sinceMs) : undefined;
    const rows =
      input.marketId && sinceDate
        ? await this.sql<OrderRow[]>`
            SELECT * FROM trade.orders
             WHERE user_id = ${principal.userId}
               AND market_id = ${input.marketId}
               AND status IN ('filled', 'cancelled', 'rejected', 'expired')
               AND created_at >= ${sinceDate}
             ORDER BY created_at DESC
             LIMIT ${limit}
          `
        : input.marketId
          ? await this.sql<OrderRow[]>`
              SELECT * FROM trade.orders
               WHERE user_id = ${principal.userId}
                 AND market_id = ${input.marketId}
                 AND status IN ('filled', 'cancelled', 'rejected', 'expired')
               ORDER BY created_at DESC
               LIMIT ${limit}
            `
          : sinceDate
            ? await this.sql<OrderRow[]>`
                SELECT * FROM trade.orders
                 WHERE user_id = ${principal.userId}
                   AND status IN ('filled', 'cancelled', 'rejected', 'expired')
                   AND created_at >= ${sinceDate}
                 ORDER BY created_at DESC
                 LIMIT ${limit}
              `
            : await this.sql<OrderRow[]>`
                SELECT * FROM trade.orders
                 WHERE user_id = ${principal.userId}
                   AND status IN ('filled', 'cancelled', 'rejected', 'expired')
                 ORDER BY created_at DESC
                 LIMIT ${limit}
              `;
    return rows.map(toOrder);
  }

  /**
   * User fills, newest first. Optional `marketId` pushes the symbol filter into
   * SQL (`fills.market_id`) so a per-market limit is honest — not a post-filter
   * of a user-wide page that can under-fill the limit.
   * Optional `sinceMs` (unix ms) filters `fills.ts >= since` in SQL (CCXT).
   * `ts` is timestamptz — convert ms via `Date`, never raw int compare.
   */
  async myFills(principal: Principal, limit = 100, marketId?: string, sinceMs?: number): Promise<FillRecord[]> {
    requireScope(principal, 'trade:read');
    const capped = Math.min(Math.max(limit, 1), 500);
    const sinceDate = sinceMs !== undefined ? new Date(sinceMs) : undefined;
    const rows =
      marketId && sinceDate
        ? await this.sql<FillRow[]>`
            SELECT * FROM trade.fills
             WHERE user_id = ${principal.userId}
               AND market_id = ${marketId}
               AND ts >= ${sinceDate}
             ORDER BY ts DESC LIMIT ${capped}
          `
        : marketId
          ? await this.sql<FillRow[]>`
              SELECT * FROM trade.fills
               WHERE user_id = ${principal.userId} AND market_id = ${marketId}
               ORDER BY ts DESC LIMIT ${capped}
            `
          : sinceDate
            ? await this.sql<FillRow[]>`
                SELECT * FROM trade.fills
                 WHERE user_id = ${principal.userId}
                   AND ts >= ${sinceDate}
                 ORDER BY ts DESC LIMIT ${capped}
              `
            : await this.sql<FillRow[]>`
                SELECT * FROM trade.fills
                 WHERE user_id = ${principal.userId}
                 ORDER BY ts DESC LIMIT ${capped}
              `;
    return rows.map(toFill);
  }

  async fillsForOrder(principal: Principal, orderId: string): Promise<FillRecord[]> {
    requireScope(principal, 'trade:read');
    const order = await this.findOrder(orderId);
    if (!order || order.userId !== principal.userId) {
      throw new TradeError(`order ${orderId} not found`, 'trade.order_not_found');
    }
    const rows = await this.sql<FillRow[]>`
      SELECT * FROM trade.fills WHERE order_id = ${orderId} AND user_id = ${principal.userId} ORDER BY ts ASC
    `;
    return rows.map(toFill);
  }

  async findOrder(orderId: string): Promise<OrderRecord | null> {
    const rows = await this.sql<OrderRow[]>`SELECT * FROM trade.orders WHERE id = ${orderId}`;
    const row = rows[0];
    return row ? toOrder(row) : null;
  }

  /**
   * CX-9 — open ↔ hold ↔ engine reconcile (Plan P1-5).
   *
   * Operator / recovery entry for a **single** suspect order. Not a cancel-all.
   *
   * | Case | Detection | Action |
   * | --- | --- | --- |
   * | orphan pending | `pending` + hold 0 | delete row (never held) |
   * | open+hold no engine | `open` + hold > 0 + cancel miss | release remainder once |
   * | open+engine no hold | `open` + hold 0 | **fail closed** — do not invent hold; cancel free book risk if live |
   *
   * Fail closed means: never mint a hold from this path; never mark filled without fills.
   */
  async reconcileOrder(orderId: string): Promise<ReconcileResult> {
    return withMoneySpan('trade.reconcileOrder', { operation: 'reconcile_order', orderId }, async () => {
      const order = await this.findOrder(orderId);
      if (!order) {
        return {
          orderId,
          case: 'not_found',
          action: 'none',
          holdBefore: '0',
          engineLive: null,
          detail: 'no order row',
        };
      }

      if (order.status !== 'pending' && order.status !== 'open') {
        return {
          orderId,
          case: 'terminal',
          action: 'none',
          holdBefore: '0',
          engineLive: null,
          detail: `status=${order.status}`,
        };
      }

      const holdBal = (await this.ledger.balance(orderHoldAccount(order.userId, order.holdAsset, order.id))).amount;
      const holdBefore = formatAmount(holdBal);

      // ── orphan pending: intent row, never funded ───────────────────────────
      if (order.status === 'pending' && holdBal === 0n) {
        await this.sql`DELETE FROM trade.orders WHERE id = ${orderId} AND status = 'pending'`;
        return {
          orderId,
          case: 'orphan_pending',
          action: 'deleted',
          holdBefore,
          engineLive: false,
          detail: 'pending row with no hold — deleted (fail-closed safe)',
        };
      }

      // ── open (or pending-with-hold) + no ledger hold — FAIL CLOSED ────────
      // Spec: open+engine no hold. We treat any open/pending with zero hold as
      // fail-closed: never invent a hold. Best-effort cancel removes free book
      // risk if the engine still has the order.
      if (holdBal === 0n) {
        const eng = await this.matching.cancel(order.marketId, orderId);
        const engineLive = eng.cancelled;
        // Terminalize without release (remainder already 0). Do not invent money.
        await this.finalize(orderId, 'cancelled');
        return {
          orderId,
          case: 'open_engine_no_hold',
          action: 'fail_closed',
          holdBefore,
          engineLive,
          detail: engineLive
            ? 'open/pending with zero hold while engine had the order — cancelled free book risk; NO hold invented'
            : 'open/pending with zero hold and engine miss — terminalized; NO hold invented',
        };
      }

      // ── open+hold: cancel probe then release remainder once ───────────────
      const eng = await this.matching.cancel(order.marketId, orderId);
      const engineLive = eng.cancelled;
      await this.finalize(orderId, 'cancelled');
      return {
        orderId,
        case: engineLive ? 'open_hold_engine_cleared' : 'open_hold_no_engine',
        action: 'released',
        holdBefore,
        engineLive,
        detail: engineLive
          ? 'open+hold; engine cancelled; remainder released once'
          : 'open+hold; engine miss (never live / already gone); remainder released once',
      };
    });
  }

  async marketById(marketId: string): Promise<Market | null> {
    const rows = await this.sql<MarketRow[]>`
      SELECT id, symbol, base_asset, quote_asset, kind, tick_size, lot_size,
             min_qty, max_qty, min_notional, status, maker_bps, taker_bps, listed_at,
                asset_class, schedule, paper
        FROM trade.markets WHERE id = ${marketId}
    `;
    const row = rows[0];
    return row ? toMarket(row) : null;
  }

  async marketBySymbol(symbol: string): Promise<Market | null> {
    const rows = await this.sql<MarketRow[]>`
      SELECT id, symbol, base_asset, quote_asset, kind, tick_size, lot_size,
             min_qty, max_qty, min_notional, status, maker_bps, taker_bps, listed_at,
                asset_class, schedule, paper
        FROM trade.markets WHERE symbol = ${symbol}
    `;
    const row = rows[0];
    return row ? toMarket(row) : null;
  }

  /**
   * Public trade tape for a market (CCXT `fetchTrades`).
   *
   * One print per match — the taker leg only — so the tape is not doubled.
   * User ids and order ids are intentionally omitted; this is the public print,
   * not `myFills`. Empty market → empty array (honest 200, not an error).
   * Optional `sinceMs` filters `fills.ts >= since` in SQL (timestamptz via Date).
   */
  async publicTape(marketId: string, limit = 100, sinceMs?: number): Promise<PublicTapePrint[]> {
    const capped = Math.min(Math.max(Math.floor(limit), 1), 500);
    const sinceDate = sinceMs !== undefined ? new Date(sinceMs) : undefined;
    type TapeRow = {
      id: string;
      side: OrderSide;
      price: string;
      qty: string;
      quote_amount: string;
      sequence: number;
      ts: Date;
    };
    // SD-3: exclude prints involving any seeded order (seed volume is not "real activity").
    const rows = sinceDate
      ? await this.sql<TapeRow[]>`
          SELECT f.id, f.side, f.price, f.qty, f.quote_amount, f.sequence, f.ts
            FROM trade.fills f
            INNER JOIN trade.orders o ON o.id = f.order_id
            INNER JOIN trade.orders c ON c.id = f.counter_order_id
           WHERE f.market_id = ${marketId}
             AND f.liquidity = 'taker'
             AND f.ts >= ${sinceDate}
             AND o.seeded = false
             AND c.seeded = false
           ORDER BY f.sequence DESC
           LIMIT ${capped}
        `
      : await this.sql<TapeRow[]>`
          SELECT f.id, f.side, f.price, f.qty, f.quote_amount, f.sequence, f.ts
            FROM trade.fills f
            INNER JOIN trade.orders o ON o.id = f.order_id
            INNER JOIN trade.orders c ON c.id = f.counter_order_id
           WHERE f.market_id = ${marketId}
             AND f.liquidity = 'taker'
             AND o.seeded = false
             AND c.seeded = false
           ORDER BY f.sequence DESC
           LIMIT ${capped}
        `;
    return rows.map((row) => ({
      id: row.id,
      side: row.side,
      price: parseAmount(row.price),
      qty: parseAmount(row.qty),
      quoteAmount: parseAmount(row.quote_amount),
      sequence: row.sequence,
      ts: row.ts,
    }));
  }

  /**
   * Candles for a market (CCXT `fetchOHLCV`), aggregated from real taker fills.
   *
   * SOURCE OF TRUTH: live SQL over `trade.fills` (see `queryCandlesFromFills`).
   * Never invents empty buckets; SD-3 excludes seeded volume. Optional durable
   * materialization is a separate job (`startCandleJobs`, default OFF).
   */
  async candles(marketId: string, timeframe: Timeframe, limit = 500, sinceMs?: number): Promise<Candle[]> {
    return queryCandlesFromFills(this.sql, { marketId, timeframe, limit, sinceMs });
  }

  // ── Algo TWAP (D-S-04) — schedule emits children; parent holds no value ─────

  /**
   * Create a TWAP schedule. Refuses when market not listed/tradable/open.
   * Does not post to the ledger. Children place through `placeOrder` on tick.
   */
  async createTwap(
    principal: Principal,
    input: {
      symbol?: string;
      marketId?: string;
      side: OrderSide;
      totalQty: Amount;
      durationMs: number;
      sliceIntervalMs: number;
      limitPrice?: Amount | null;
      subAccountId?: string;
      clientAlgoId?: string;
      /** Only `twap` in v1 — VWAP/POV refused by name. */
      kind?: string;
    },
  ): Promise<TwapParent> {
    requireScope(principal, 'trade:write');
    if (!this.algoEnabled) {
      throw new TradeError('algo execution is disabled by the operator kill-switch', 'trade.algo_disabled');
    }
    if (!this.spotEnabled) {
      throw new TradeError('spot trading is disabled by the operator kill-switch', 'trade.spot_disabled');
    }
    const kind = (input.kind ?? 'twap').toLowerCase();
    if (kind !== 'twap') {
      throw new TradeError(
        `algo kind "${kind}" is not available — v1 is TWAP only (VWAP/POV wait on a real volume series)`,
        'trade.algo_unsupported_kind',
      );
    }

    const market = await this.requireMarket(input);
    // TWAP is spot-only by name (see `assertSpotSurface`), not because
    // `assertTradable` happens to refuse the kind.
    assertSpotSurface(market, 'TWAP');
    assertTradable(market);
    assertMarketOpen(market, this.now());
    assertQty(market, input.totalQty);
    if (input.subAccountId) {
      await assertSubAccountOwned(this.subAccounts, principal.userId, input.subAccountId);
    }

    // Refuse at creation when mark feed is blank — never accept a schedule that cannot run.
    const depth = await this.matching.depth(market.id, 1);
    const bid = depth.bids[0] ? parseAmount(depth.bids[0][0]) : null;
    const ask = depth.asks[0] ? parseAmount(depth.asks[0][0]) : null;
    if (bid === null || ask === null) {
      throw new TradeError(
        `${market.symbol}: no two-sided mark at creation — refusing TWAP rather than inventing a feed`,
        'trade.algo_mark_missing',
      );
    }

    const createInput: CreateTwapInput = {
      marketId: market.id,
      symbol: market.symbol,
      side: input.side,
      totalQty: input.totalQty,
      durationMs: input.durationMs,
      sliceIntervalMs: input.sliceIntervalMs,
      limitPrice: input.limitPrice ?? null,
      subAccountId: input.subAccountId ?? null,
      clientAlgoId: input.clientAlgoId,
    };

    // Store principal on a side map so child place uses the real caller scopes.
    this.algoPrincipals.set(principal.userId, principal);

    const parent = this.algo.create(principal.userId, createInput, market.lotSize);
    // Await durable write so a crash between create and first onChange cannot lose the schedule.
    const plan = this.algo.planOf(parent.id) ?? [];
    await this.algoStore.save({ parent, plan });
    return parent;
  }

  async getAlgo(principal: Principal, parentId: string): Promise<TwapParent> {
    requireScope(principal, 'trade:read');
    let parent = this.algo.get(parentId);
    if (!parent) {
      const loaded = await this.algoStore.load(parentId);
      if (loaded && loaded.parent.userId === principal.userId) {
        this.algo.hydrate(loaded.parent, loaded.plan);
        parent = loaded.parent;
      }
    }
    if (!parent || parent.userId !== principal.userId) {
      throw new TradeError(`algo ${parentId} not found`, 'trade.algo_not_found');
    }
    return parent;
  }

  async algoProgress(principal: Principal, parentId: string): Promise<AlgoProgressView> {
    const parent = await this.getAlgo(principal, parentId);
    let filled = 0n;
    for (const child of parent.children) {
      const fills = await this.fillsForOrder(principal, child.orderId);
      for (const f of fills) filled += f.qty;
    }
    return presentAlgoProgress(parent, filled);
  }

  async pauseAlgo(principal: Principal, parentId: string): Promise<TwapParent> {
    requireScope(principal, 'trade:write');
    return this.algo.pause(principal.userId, parentId);
  }

  async resumeAlgo(principal: Principal, parentId: string): Promise<TwapParent> {
    requireScope(principal, 'trade:write');
    return this.algo.resume(principal.userId, parentId);
  }

  async cancelAlgo(principal: Principal, parentId: string): Promise<TwapParent> {
    requireScope(principal, 'trade:write');
    // Install the live caller's principal BEFORE engine.cancel so cancelChild
    // can cancel open children after a process restart. Place still refuses
    // without a durable principal grant (SOCKET §13) — cancel is different:
    // the user is presenting authority right now.
    this.algoPrincipals.set(principal.userId, principal);
    return this.algo.cancel(principal.userId, parentId);
  }

  /** Drive one parent's next due slice (job host / tests). */
  async tickAlgo(parentId: string) {
    return this.algo.tick(parentId);
  }

  /** Drive all active algos once. Hydrates durable active parents first. */
  async tickAllAlgos() {
    const active = await this.algoStore.listActive();
    for (const rec of active) {
      if (!this.algo.get(rec.parent.id)) {
        this.algo.hydrate(rec.parent, rec.plan);
      }
    }
    return this.algo.tickAll();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async requireMarket(input: { symbol?: string; marketId?: string }): Promise<Market> {
    const market = input.marketId ? await this.marketById(input.marketId) : input.symbol ? await this.marketBySymbol(input.symbol) : null;
    if (!market) throw new TradeError(`market ${input.symbol ?? input.marketId ?? '(unspecified)'} not found`, 'trade.market_not_found');
    return market;
  }

  private async bestAsk(marketId: string): Promise<Amount | null> {
    const depth = await this.matching.depth(marketId, 1);
    const best = depth.asks[0];
    return best ? parseAmount(best[0]) : null;
  }

  private toEngineRequest(
    orderId: string,
    userId: string,
    input: PlaceOrderInput,
    orderType: OrderType,
    tif: TimeInForce,
    protectionPrice: Amount | null,
  ): EngineSubmitRequest {
    // A market BUY goes to the engine as a marketable IOC LIMIT at its
    // protection price. That is not a workaround — it is what makes "the engine
    // only ever matches funded orders" true for an order type that has no price
    // of its own. FOK is preserved because it is a different promise to the
    // caller, and the engine keeps it either way.
    if (orderType === 'market' && input.side === 'buy') {
      return {
        orderId,
        accountId: userId,
        type: 'limit',
        side: 'buy',
        qty: formatAmount(input.qty),
        price: formatAmount(protectionPrice as Amount),
        stopPrice: null,
        tif: tif === 'FOK' ? 'FOK' : 'IOC',
      };
    }

    if (orderType === 'market') {
      return {
        orderId,
        accountId: userId,
        type: 'market',
        side: input.side,
        qty: formatAmount(input.qty),
        price: null,
        stopPrice: null,
        tif: tif === 'FOK' ? 'FOK' : 'IOC',
      };
    }

    return {
      orderId,
      accountId: userId,
      type: 'limit',
      side: input.side,
      qty: formatAmount(input.qty),
      price: formatAmount(input.price as Amount),
      stopPrice: null,
      tif,
    };
  }

  private async refreshFilledQty(orderId: string): Promise<void> {
    await this.sql`
      UPDATE trade.orders o
         SET filled_qty = COALESCE((SELECT SUM(f.qty) FROM trade.fills f WHERE f.order_id = o.id), 0),
             updated_at = now()
       WHERE o.id = ${orderId}
    `;
  }
}
