import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import type { EventBus } from '@intafaced/events';
import { requireScope, type Principal } from '@intafaced/auth';
import { formatAmount, mul, mulBps, parseAmount, recipes, sub, type Amount, type LedgerClient } from '@intafaced/ledger-client';
import { withMoneySpan } from '../tracing.js';
import { ratesForFill } from './fees.js';
import { fillIdFor, fillLegIdFor, orderIdFor } from './ids.js';
import {
  assertMarketOpen,
  assertNotional,
  assertPrice,
  assertQty,
  assertTradable,
  holdFor,
  protectionPriceFor,
  requireSupportedType,
} from './risk.js';
import { toFill, toMarket, toOrder, type FillRow, type MarketRow, type OrderRow } from './rows.js';
import type { RankPerksSource } from './rank-perks.js';
import type { EngineCancellation, EngineFill, EngineSubmitRequest, EngineSubmitResult, MatchingClient } from './matching-client.js';
import { estimateConvert, presentConvertQuote } from '../convert/quote.js';
import {
  TradeError,
  type FillRecord,
  type Market,
  type OrderRecord,
  type OrderSide,
  type OrderStatus,
  type OrderType,
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
}

export class TradeService {
  private readonly spotEnabled: boolean;
  private readonly slippageCapBps: number;
  private readonly convertEnabled: boolean;
  private readonly convertSpreadBps: number;
  private readonly convertQuoteTtlMs: number;

  constructor(
    private readonly sql: Sql,
    private readonly ledger: LedgerClient,
    private readonly matching: MatchingClient,
    private readonly perks: RankPerksSource,
    private readonly bus: EventBus,
    options: TradeServiceOptions = {},
  ) {
    this.spotEnabled = options.spotEnabled ?? true;
    this.slippageCapBps = options.marketSlippageCapBps ?? 200;
    this.convertEnabled = options.convertEnabled ?? true;
    this.convertSpreadBps = options.convertSpreadBps ?? 10;
    this.convertQuoteTtlMs = options.convertQuoteTtlMs ?? 15_000;
  }

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
    const rows = await this.sql<MarketRow[]>`
      INSERT INTO trade.markets (
        symbol, base_asset, quote_asset, kind, tick_size, lot_size,
        min_qty, max_qty, min_notional, status, maker_bps, taker_bps, listed_at,
        asset_class, schedule, display_name
      ) VALUES (
        ${input.symbol}, ${input.baseAsset}, ${input.quoteAsset}, 'spot',
        ${formatAmount(input.tickSize)}::numeric, ${formatAmount(input.lotSize)}::numeric,
        ${formatAmount(input.minQty)}::numeric,
        ${input.maxQty == null ? null : formatAmount(input.maxQty)}::numeric,
        ${formatAmount(input.minNotional)}::numeric,
        ${input.status ?? 'active'}, ${input.makerBps}, ${input.takerBps}, now(),
        ${input.assetClass ?? 'crypto'}, ${input.schedule ?? 'crypto-24x7'},
        ${input.displayName ?? input.symbol}
      )
      ON CONFLICT (symbol) DO UPDATE SET updated_at = now()
      RETURNING id, symbol, base_asset, quote_asset, kind, tick_size, lot_size,
                min_qty, max_qty, min_notional, status, maker_bps, taker_bps, listed_at,
                asset_class, schedule
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
                asset_class, schedule
    `;
    const row = rows[0];
    if (!row) throw new TradeError(`market ${marketId} not found`, 'trade.market_not_found');
    return toMarket(row);
  }

  async markets(): Promise<Market[]> {
    const rows = await this.sql<MarketRow[]>`
      SELECT id, symbol, base_asset, quote_asset, kind, tick_size, lot_size,
             min_qty, max_qty, min_notional, status, maker_bps, taker_bps, listed_at,
                asset_class, schedule
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

    if (!this.spotEnabled) {
      throw new TradeError('spot trading is disabled by the operator kill-switch', 'trade.spot_disabled');
    }

    // ── 2 · RISK CHECKS ─────────────────────────────────────────────────────
    const market = await this.requireMarket(input);
    assertTradable(market);
    // Before any hold is taken. A closed venue cannot fill, so funding an order
    // into one locks the user's balance behind a book nobody is matching until
    // the session reopens.
    assertMarketOpen(market, new Date());
    const orderType: OrderType = requireSupportedType(input.type);
    assertQty(market, input.qty);

    const tif: TimeInForce = input.tif ?? 'GTC';
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
        price, qty, status, tif, hold_asset, hold_amount, fee_discount_bps, protection_price
      ) VALUES (
        ${orderId}, ${userId}, ${input.subAccountId ?? null}, ${market.id}, ${input.clientOrderId ?? null},
        ${input.side}, ${orderType},
        ${input.price == null ? null : formatAmount(input.price)}::numeric,
        ${formatAmount(input.qty)}::numeric, 'pending', ${tif},
        ${hold.assetId}, ${formatAmount(hold.amount)}::numeric, ${perks.feeDiscountBps},
        ${protectionPrice === null ? null : formatAmount(protectionPrice)}::numeric
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
    if (!maker || !taker) {
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

    for (const leg of legs) {
      await this.sql`
        INSERT INTO trade.fills (
          id, order_id, counter_order_id, market_id, user_id, side, liquidity,
          price, qty, quote_amount, fee_asset, fee_amount, fee_bps, sequence
        ) VALUES (
          ${fillLegIdFor(market.id, fill.sequence, leg.role)}, ${leg.order.id}, ${leg.counterOrderId},
          ${market.id}, ${leg.order.userId}, ${leg.side}, ${leg.role},
          ${formatAmount(price)}::numeric, ${formatAmount(qty)}::numeric, ${formatAmount(quoteAmount)}::numeric,
          ${leg.feeAsset}, ${formatAmount(leg.feeAmount)}::numeric, ${leg.feeBps}, ${fill.sequence}
        )
        ON CONFLICT (market_id, sequence, liquidity) DO NOTHING
      `;
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
  }

  // ── Holds: the only two things that can happen to one ─────────────────────

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
   */
  async settleFillEvent(input: {
    marketId: string;
    makerOrderId: string;
    takerOrderId: string;
    price: string;
    qty: string;
    sequence: number;
  }): Promise<void> {
    const market = await this.marketById(input.marketId);
    if (!market) throw new TradeError(`market ${input.marketId} not found`, 'trade.market_not_found');

    const taker = await this.findOrder(input.takerOrderId);
    if (!taker) throw new TradeError(`order ${input.takerOrderId} not found`, 'trade.order_not_found');

    await withMoneySpan(
      'trade.settleFillEvent',
      { operation: 'settle_fill', marketId: input.marketId, symbol: market.symbol, qty: input.qty },
      async () => {
        await this.settleFill(market, {
          sequence: input.sequence,
          makerOrderId: input.makerOrderId,
          makerAccountId: '',
          takerOrderId: input.takerOrderId,
          takerAccountId: '',
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

  async myFills(principal: Principal, limit = 100): Promise<FillRecord[]> {
    requireScope(principal, 'trade:read');
    const rows = await this.sql<FillRow[]>`
      SELECT * FROM trade.fills WHERE user_id = ${principal.userId} ORDER BY ts DESC LIMIT ${Math.min(limit, 500)}
    `;
    return rows.map(toFill);
  }

  async findOrder(orderId: string): Promise<OrderRecord | null> {
    const rows = await this.sql<OrderRow[]>`SELECT * FROM trade.orders WHERE id = ${orderId}`;
    const row = rows[0];
    return row ? toOrder(row) : null;
  }

  async marketById(marketId: string): Promise<Market | null> {
    const rows = await this.sql<MarketRow[]>`
      SELECT id, symbol, base_asset, quote_asset, kind, tick_size, lot_size,
             min_qty, max_qty, min_notional, status, maker_bps, taker_bps, listed_at,
                asset_class, schedule
        FROM trade.markets WHERE id = ${marketId}
    `;
    const row = rows[0];
    return row ? toMarket(row) : null;
  }

  async marketBySymbol(symbol: string): Promise<Market | null> {
    const rows = await this.sql<MarketRow[]>`
      SELECT id, symbol, base_asset, quote_asset, kind, tick_size, lot_size,
             min_qty, max_qty, min_notional, status, maker_bps, taker_bps, listed_at,
                asset_class, schedule
        FROM trade.markets WHERE symbol = ${symbol}
    `;
    const row = rows[0];
    return row ? toMarket(row) : null;
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
