import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireScope, type Principal } from '@intafaced/auth';
import { checkAccess } from '@intafaced/config';
import { createEdgeContext, type Context, type EdgeRequest } from '@intafaced/contracts';
import { createOrderRequestSchema, type CreateOrderRequest } from '@intafaced/exchange-contract';
import { ZERO, add, formatAmount, mul, parseAmount, type AccountKind, type Amount, type Balance } from '@intafaced/ledger-client';
import {
  UNAUTHENTICATED,
  badRequest,
  badSymbol,
  invalidOrder,
  notSupported,
  permissionDenied,
  toCcxtError,
  type CcxtErrorResponse,
} from './ccxt-errors.js';
import type { Position } from '@intafaced/exchange-contract';
import type { PlaceOrderInput } from './spot/trade-service.js';
import { TradeError, type FillRecord, type Market, type OrderRecord, type OrderStatus } from './spot/types.js';
import { FuturesError } from './futures/position-service.js';
import type { MarginCallWire } from './futures/margin-call-transport.js';
import type { AdlDisclosureWire } from './futures/adl-disclosure.js';
import type { AdlActionDisclosureWire } from './futures/adl-last-resort.js';
import { AdlDisclosureError } from './futures/adl-disclosure.js';

/**
 * Private CCXT-style REST (trade.ccxt-api — authenticated).
 *
 * Paths match `REST_ROUTES` in `@intafaced/exchange-contract`:
 *   GET    /api/v1/orders/open     scope: trade:read
 *   GET    /api/v1/orders/closed   scope: trade:read  (?symbol=&limit=&since= ms)
 *   GET    /api/v1/orders/:id      scope: trade:read
 *   POST   /api/v1/orders          scope: trade:write + jurisdiction(module=trade)
 *   DELETE /api/v1/orders/:id      scope: trade:write + jurisdiction(module=trade)
 *   DELETE /api/v1/orders          scope: trade:write + jurisdiction(module=trade)  (cancelAll; ?symbol= optional)
 *   GET    /api/v1/account/trades  scope: trade:read  (?symbol=&limit=&since= ms)
 *   GET    /api/v1/account/fees    scope: trade:read  (published maker/taker from markets)
 *   GET    /api/v1/account/balance scope: trade:read  (ledger projection; self-only)
 *   GET    /api/v1/positions       scope: trade:read  (open futures rows; [] when none)
 *   GET    /api/v1/positions/:id/margin-call  scope: trade:read  (delivered call or 404)
 *   GET    /api/v1/futures/adl-disclosure     scope: trade:read  (copy + ack — DIRECTION:34)
 *   POST   /api/v1/futures/adl-disclosure/ack scope: trade:write (ack before open)
 *   GET    /api/v1/futures/adl-events         scope: trade:read  (disclosure-before-action)
 *   POST   /api/v1/positions       scope: trade:write (open funded position — F3)
 *   DELETE /api/v1/positions/:id   scope: trade:write (close + release margin — F3)
 *
 * Auth is the mount boundary: edge terminates the bearer (JWT or API key) and
 * forwards a signed principal on every `/api/*` hop. This service never parses
 * the caller's token — it verifies the edge signature via `createEdgeContext`,
 * exactly like the tRPC mount. A self-asserted principal header is anonymous.
 *
 * Money path: create/cancel/cancelAll call TradeService only — no second hold
 * path, no balances outside the ledger. Balance is a read of ledger.balances
 * for principal.userId only (Doctrine §0.6 projection, not a second store).
 */

const DEFAULT_HISTORY = 100;
const MAX_HISTORY = 500;
const DEFAULT_FILLS = 100;
const MAX_FILLS = 500;

/** Spot-supported order types only (TradeService rejects stop/take-profit). */
function isSpotOrderType(type: string): type is 'market' | 'limit' {
  return type === 'market' || type === 'limit';
}

export interface PrivateRestDeps {
  /** Shared EDGE_PRINCIPAL_SECRET — same value tRPC uses. */
  edgeSecret: string;
  serviceName: string;
  openOrders(principal: Principal, marketId?: string): Promise<OrderRecord[]>;
  orderHistory(principal: Principal, input: { marketId?: string; limit?: number; sinceMs?: number }): Promise<OrderRecord[]>;
  getOrder(principal: Principal, orderId: string): Promise<OrderRecord>;
  placeOrder(principal: Principal, input: PlaceOrderInput): Promise<OrderRecord>;
  cancelOrder(principal: Principal, orderId: string): Promise<OrderRecord>;
  /** Cancel every open/pending order (optional market). Sequential money path. */
  cancelAllOrders(principal: Principal, marketId?: string): Promise<OrderRecord[]>;
  /**
   * Optional marketId filters fills in SQL (WHERE market_id = …).
   * Optional sinceMs (unix ms) filters fills.ts >= since in SQL.
   */
  myFills(principal: Principal, limit: number, marketId?: string, sinceMs?: number): Promise<FillRecord[]>;
  marketBySymbol(symbol: string): Promise<Market | null>;
  /** Resolve symbol for an order's marketId (wire needs the unified form). */
  marketById(marketId: string): Promise<Market | null>;
  /**
   * All listed markets — source of published maker/taker bps for
   * `GET /account/fees`. Empty list → honest `{}` on the wire.
   */
  markets(): Promise<Market[]>;
  /**
   * Ledger balances for one user. Route MUST pass only `principal.userId` —
   * never a client-supplied ownerId. S2S ledger client has no per-user gate;
   * self-only is enforced here at the edge of this surface.
   */
  userBalances(userId: string): Promise<readonly Balance[]>;
  /** Open futures positions for the principal (empty [] when none). */
  listPositions(principal: Principal, symbol?: string): Promise<Position[]>;
  /**
   * Open a futures position. NO PRICE PARAMETER, on purpose — the entry price is
   * read from the mark port inside the service. See `PRICE_FIELDS` below.
   */
  openPosition(
    principal: Principal,
    input: {
      symbol: string;
      side: 'long' | 'short';
      size: string;
      leverage: string;
      /**
       * `'isolated'` is the only inhabitant, deliberately — see
       * `crossMarginRefusal`. Cross margin is not a disabled flag here, it is
       * a value the type system cannot express.
       */
      marginMode?: 'isolated';
      /** Required retry key — same as spot clientOrderId; see positionIdFor. */
      clientOpenId: string;
    },
  ): Promise<Position>;
  /** Close at the current mark. No price parameter, for the same reason. */
  closePosition(principal: Principal, positionId: string): Promise<Position>;
  /**
   * Open delivered margin call for a position owned by the principal.
   * Null → 404 (no call, or not theirs). Never invents a call.
   */
  getOpenMarginCall(principal: Principal, positionId: string): Promise<MarginCallWire | null>;
  /**
   * DIRECTION:34 — current ADL disclosure copy + whether this principal has ack'd.
   */
  getAdlDisclosure(principal: Principal): Promise<AdlDisclosureWire>;
  /** Record ack for the current disclosure version (required before open). */
  ackAdlDisclosure(principal: Principal): Promise<AdlDisclosureWire>;
  /**
   * Observable ADL disclosure-before-action events for this principal
   * (candidate side). Empty [] when none — never invents events.
   */
  listAdlDisclosureEvents(principal: Principal): Promise<AdlActionDisclosureWire[]>;
}

/**
 * FIELDS A CALLER MAY NOT SET, BECAUSE THEY MOVE MONEY.
 *
 * `docs/adr/2026-08-05-futures-risk-and-mark-law.md`: a price that moves money
 * is never supplied by the party it pays. These used to be read straight off the
 * request — `entryPrice` from the POST body, `exitPrice` from the DELETE query —
 * and `exitPrice` alone decided the realised PnL that `futuresRealizeProfit`
 * then paid out of a house pot.
 *
 * Presence is REFUSED, not ignored. Silently substituting the real mark would
 * give a caller different behaviour from the one they asked for and no way to
 * notice: a bot closing at its own favourable number would keep sending it,
 * keep getting 200s, and keep booking a PnL it never actually chose. The ADR's
 * refuse table puts this in its first row for exactly that reason.
 */
const PRICE_FIELDS = ['entryPrice', 'exitPrice', 'price', 'markPrice'] as const;

/** Which forbidden price fields a request carries. Empty when it carries none. */
export function suppliedPriceFields(source: Record<string, unknown> | null | undefined): string[] {
  if (source == null) return [];
  return PRICE_FIELDS.filter((f) => source[f] !== undefined);
}

/** One refusal shape, so both routes say it identically. */
export function priceNotAcceptedBody(fields: readonly string[]): { error: string; message: string } {
  return {
    error: 'trade.price_not_accepted',
    message:
      `${fields.join(', ')} may not be supplied by the caller — a price that moves money is read from the mark source, ` +
      'not from the request. Resend without it and the current mark is used.',
  };
}

/**
 * CROSS MARGIN IS REFUSED, NOT COERCED.
 *
 * `DIRECTION` §1 is isolated margin only, and the futures ADR's done bar item 8
 * is stronger than "off": *no cross-margin path exists, even disabled*. The
 * route used to accept `marginMode: 'cross'` and persist it, and anything it
 * did not recognise it quietly turned into isolated.
 *
 * Both halves are wrong, and the quiet one is worse. A trader who asked for
 * cross margin and was given an isolated position has been told their loss is
 * capped at this position's margin when they believe their whole balance is
 * backing it — or the reverse. Cross margin is a different product with a
 * different liquidation model; it needs its own spec, not a coerced enum.
 *
 * Returns the refusal body, or null when the value is acceptable.
 */
export function crossMarginRefusal(value: unknown): { error: string; message: string } | null {
  if (value === undefined || value === 'isolated') return null;
  if (value === 'cross') {
    return {
      error: 'trade.cross_margin_unsupported',
      message:
        'marginMode "cross" is not supported: this platform runs isolated margin only, and there is no cross-margin path ' +
        'to enable. Omit marginMode or send "isolated" — a position opened as isolated when you asked for cross would ' +
        'misreport what is backing it.',
    };
  }
  return {
    error: 'trade.bad_request',
    message: `marginMode ${JSON.stringify(value)} is not a margin mode — send "isolated" or omit it.`,
  };
}

/** Kinds that count as locked / not free under exchange-contract free/used/total. */
const USED_KINDS: ReadonlySet<AccountKind> = new Set(['hold', 'escrow', 'stake', 'collateral']);

/**
 * Project ledger Balance[] into CCXT `balancesSchema`:
 *   free  → `available`
 *   used  → hold + escrow + stake + collateral (all purposes summed per asset)
 *   total → free + used
 *
 * Empty ledger rows → honest empty `balances: {}`. No fabricated zero assets.
 * Unknown future kinds are ignored rather than guessed into free/used.
 */
export function presentCcxtBalances(
  rows: readonly Balance[],
  now: Date = new Date(),
): {
  timestamp: number;
  datetime: string;
  balances: Record<string, { free: string; used: string; total: string }>;
} {
  const freeBy = new Map<string, bigint>();
  const usedBy = new Map<string, bigint>();

  for (const row of rows) {
    const asset = row.account.assetId;
    const kind = row.account.kind;
    if (kind === 'available') {
      freeBy.set(asset, (freeBy.get(asset) ?? 0n) + row.amount);
    } else if (USED_KINDS.has(kind)) {
      usedBy.set(asset, (usedBy.get(asset) ?? 0n) + row.amount);
    }
  }

  const assets = [...new Set([...freeBy.keys(), ...usedBy.keys()])].sort();
  const balances: Record<string, { free: string; used: string; total: string }> = {};
  for (const asset of assets) {
    const free = freeBy.get(asset) ?? 0n;
    const used = usedBy.get(asset) ?? 0n;
    balances[asset] = {
      free: formatAmount(free),
      used: formatAmount(used),
      total: formatAmount(free + used),
    };
  }

  const timestamp = now.getTime();
  return {
    timestamp,
    datetime: now.toISOString(),
    balances,
  };
}

/** Map internal order status → CCXT `orderSchema.status`. */
export function toCcxtOrderStatus(status: OrderStatus): 'open' | 'closed' | 'canceled' | 'expired' | 'rejected' {
  switch (status) {
    case 'pending':
    case 'open':
      return 'open';
    case 'filled':
      return 'closed';
    case 'cancelled':
      return 'canceled';
    case 'rejected':
      return 'rejected';
    case 'expired':
      return 'expired';
  }
}

/**
 * Quote notional for a CCXT order wire.
 *
 * Priority:
 *   1. Σ fill.quoteAmount when fills are loaded (true cost — audit ideal).
 *   2. limit price × filled, or market-buy protectionPrice × filled (R6).
 *   3. unfilled → `"0"` (nothing moved).
 *   4. filled but no basis and no fills → `null` (honest unknown).
 *
 * Market sells have no limit price and no protectionPrice, so without a fill
 * load the residual used to invent confident `"0"`. That lies about quote
 * moved — never do it (PEACE residual after R6).
 */
export function presentCcxtOrderCost(order: OrderRecord, fills?: readonly Pick<FillRecord, 'quoteAmount'>[]): string | null {
  if (order.filledQty === 0n) return '0';
  if (fills !== undefined) {
    let total: Amount = ZERO;
    for (const f of fills) total = add(total, f.quoteAmount);
    return formatAmount(total);
  }
  const costBasis = order.price ?? order.protectionPrice;
  if (costBasis === null) return null;
  return formatAmount(mul(costBasis, order.filledQty));
}

/**
 * CCXT `Order` shape (decimal strings). Fees/trades omitted on list/get unless
 * the fill set is loaded elsewhere — bots re-fetch fills via account/trades.
 * Pass `fills` when loaded so `cost` is Σ quote (true notional), not null.
 */
export function presentCcxtOrder(order: OrderRecord, symbol: string, opts?: { fills?: readonly Pick<FillRecord, 'quoteAmount'>[] }) {
  const ts = order.createdAt.getTime();
  const amount = formatAmount(order.qty);
  const filled = formatAmount(order.filledQty);
  const remaining = formatAmount(order.qty - order.filledQty);
  const price = order.price === null ? null : formatAmount(order.price);
  const cost = presentCcxtOrderCost(order, opts?.fills);

  return {
    id: order.id,
    clientOrderId: order.clientOrderId,
    timestamp: ts,
    datetime: new Date(ts).toISOString(),
    lastTradeTimestamp: null as number | null,
    symbol,
    type: order.type,
    side: order.side,
    timeInForce: order.tif,
    postOnly: order.tif === 'PO',
    reduceOnly: false,
    price,
    stopPrice: null as string | null,
    average: null as string | null,
    amount,
    filled,
    remaining,
    cost,
    status: toCcxtOrderStatus(order.status),
    fee: null as { cost: string; currency: string } | null,
    trades: [] as [],
  };
}

/** Integer bps → decimal rate string for tradeSchema.fee.rate (10 bps → "0.001"). */
export function bpsToFeeRate(bps: number): string {
  if (!Number.isInteger(bps) || bps < 0) return '0';
  const whole = Math.floor(bps / 10_000);
  const frac = bps % 10_000;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(4, '0')}`.replace(/0+$/, '');
}

/**
 * CCXT `TradingFee` from a market's published maker/taker bps.
 * `percentage: true` — maker/taker are rate fractions (10 bps → "0.001").
 * Rank/IFC effective rates are not applied here; bots re-read after fills.
 */
export function presentCcxtTradingFee(market: Market) {
  return {
    symbol: market.symbol,
    maker: bpsToFeeRate(market.makerBps),
    taker: bpsToFeeRate(market.takerBps),
    percentage: true as const,
  };
}

/**
 * Build `Record<symbol, TradingFee>` from markets that expose integer bps.
 * Markets without usable rates are skipped; zero markets → `{}` (honest empty).
 */
export function presentTradingFees(markets: Market[]): Record<string, ReturnType<typeof presentCcxtTradingFee>> {
  const out: Record<string, ReturnType<typeof presentCcxtTradingFee>> = {};
  for (const market of markets) {
    if (!Number.isInteger(market.makerBps) || market.makerBps < 0) continue;
    if (!Number.isInteger(market.takerBps) || market.takerBps < 0) continue;
    out[market.symbol] = presentCcxtTradingFee(market);
  }
  return out;
}

/**
 * CCXT private trade (my fill) — decimal strings; fee.rate from bps.
 * `order` is the caller's order id (not the counter).
 */
export function presentCcxtMyTrade(fill: FillRecord, symbol: string) {
  const ts = fill.ts.getTime();
  return {
    id: fill.id,
    order: fill.orderId,
    timestamp: ts,
    datetime: new Date(ts).toISOString(),
    symbol,
    type: null as string | null,
    side: fill.side,
    takerOrMaker: fill.liquidity,
    price: formatAmount(fill.price),
    amount: formatAmount(fill.qty),
    cost: formatAmount(fill.quoteAmount),
    fee: {
      cost: formatAmount(fill.feeAmount),
      currency: fill.feeAsset,
      rate: bpsToFeeRate(fill.feeBps),
    },
  };
}

function parseLimit(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/**
 * Optional CCXT `since` (unix ms). Absent/empty → no filter.
 * NaN or negative → invalid (caller returns 400). Zero is valid (epoch).
 */
export function parseSince(raw: unknown): { ok: true; sinceMs?: number } | { ok: false; message: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, sinceMs: undefined };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, message: 'since must be a non-negative unix timestamp in milliseconds' };
  }
  return { ok: true, sinceMs: Math.floor(n) };
}

/**
 * Map CCXT create body → PlaceOrderInput (decimal strings → Amount).
 * Only market/limit; postOnly becomes tif PO when no other tif is set.
 */
export function mapCreateOrderBody(body: CreateOrderRequest): PlaceOrderInput {
  if (!isSpotOrderType(body.type)) {
    throw new TradeError(
      `order type "${body.type}" is not supported on this venue (spot supports market and limit)`,
      'trade.order_type_unsupported',
    );
  }
  if (body.reduceOnly === true) {
    throw new TradeError('reduceOnly is not supported on spot', 'trade.order_type_unsupported');
  }

  let tif = body.timeInForce;
  if (body.postOnly === true) {
    if (tif && tif !== 'GTC' && tif !== 'PO') {
      throw new TradeError('postOnly cannot be combined with an immediate time-in-force', 'trade.invalid_price');
    }
    tif = 'PO';
  }

  return {
    symbol: body.symbol,
    side: body.side,
    type: body.type,
    qty: parseAmount(body.amount),
    price: body.price === undefined ? null : parseAmount(body.price),
    tif,
    clientOrderId: body.clientOrderId,
    subAccountId: body.subAccountId,
  };
}

async function symbolForOrder(
  order: OrderRecord,
  cache: Map<string, string>,
  marketById: (id: string) => Promise<Market | null>,
): Promise<string> {
  let symbol = cache.get(order.marketId);
  if (symbol === undefined) {
    const market = await marketById(order.marketId);
    symbol = market?.symbol ?? order.marketId;
    cache.set(order.marketId, symbol);
  }
  return symbol;
}

/** Send an already-mapped CCXT error. */
function sendCcxt(reply: FastifyReply, res: CcxtErrorResponse): FastifyReply {
  return reply.code(res.status).send(res.body);
}

/**
 * Domain → CCXT wire error for private REST.
 *
 * This used to publish our own internal codes (`trade.below_min_notional`,
 * `LedgerError`, `Unauthorized`) straight onto a surface whose entire purpose
 * is that an off-the-shelf CCXT client can read it. A client branches on the
 * error *class* to decide whether to retry, so an unrecognised code left it
 * with only the HTTP status — and the statuses alone cannot tell
 * `InsufficientFunds` (never retry) from `perks_unavailable` (retry) since both
 * arrived as 400/500 with an opaque label.
 *
 * The whole mapping, and the reasoning for each arm, is in `ccxt-errors.ts`.
 * `intafacedCode` still carries our finer-grained code for support and logs.
 *
 * Returns null when the error is not one we recognise, so the caller rethrows
 * and it surfaces as a real 500 rather than a relabelled retry instruction.
 */
function sendDomainError(reply: FastifyReply, err: unknown): FastifyReply | null {
  const mapped = toCcxtError(err);
  if (!mapped) return null;
  return sendCcxt(reply, mapped);
}

/**
 * Register private REST routes. Requires a real edge secret (≥32 chars) —
 * same boot bar as tRPC via `createEdgeContext`.
 */
export function registerPrivateRest(app: FastifyInstance, deps: PrivateRestDeps): void {
  const edgeContext = createEdgeContext({ secret: deps.edgeSecret, serviceName: deps.serviceName });

  function contextFrom(req: FastifyRequest): Context {
    const edgeReq: EdgeRequest = {
      headers: req.headers as Record<string, string | string[] | undefined>,
      id: req.id,
    };
    return edgeContext(edgeReq);
  }

  /** Fail closed: missing / forged / expired edge principal → 401. */
  function requirePrincipal(req: FastifyRequest, reply: FastifyReply): Principal | null {
    const principal = contextFrom(req).principal;
    if (!principal) {
      void sendCcxt(reply, UNAUTHENTICATED);
      return null;
    }
    return principal;
  }

  /**
   * Jurisdiction gate for money writes — mirrors `scopedProcedure(..., { module: 'trade' })`.
   * Scope is still enforced inside TradeService; this refuses a region that may not trade.
   */
  function requireTradeJurisdiction(req: FastifyRequest, reply: FastifyReply, principal: Principal): boolean {
    const { region } = contextFrom(req);
    const decision = checkAccess({
      module: 'trade',
      plane: 'fiat',
      region,
      kycTier: principal.tier,
    });
    if (!decision.allowed) {
      // Credentials were fine; this principal may not trade from here. CCXT
      // `PermissionDenied` — a bot must stop, not re-sign and retry. The tier
      // requirement rides along so a client can tell the user what to do.
      void reply.code(403).send({
        ...permissionDenied(decision.reason, decision.code).body,
        ...(decision.requiredTier ? { requiredTier: decision.requiredTier } : {}),
      });
      return false;
    }
    return true;
  }

  // ── Static paths first (before :id) ───────────────────────────────────────

  app.get<{ Querystring: { symbol?: string } }>('/api/v1/orders/open', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;

    let marketId: string | undefined;
    const symbolRaw = req.query.symbol;
    if (symbolRaw !== undefined && symbolRaw !== '') {
      const symbol = decodeURIComponent(symbolRaw);
      const market = await deps.marketBySymbol(symbol);
      if (!market) {
        return sendCcxt(reply, badSymbol(symbol));
      }
      marketId = market.id;
    }

    try {
      const orders = await deps.openOrders(principal, marketId);
      const symbolByMarket = new Map<string, string>();
      const wire = [];
      for (const order of orders) {
        const symbol = await symbolForOrder(order, symbolByMarket, deps.marketById);
        wire.push(presentCcxtOrder(order, symbol));
      }
      return reply.code(200).send(wire);
    } catch (err) {
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });

  app.get<{ Querystring: { symbol?: string; limit?: string; since?: string } }>('/api/v1/orders/closed', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;

    let marketId: string | undefined;
    const symbolRaw = req.query.symbol;
    if (symbolRaw !== undefined && symbolRaw !== '') {
      const symbol = decodeURIComponent(symbolRaw);
      const market = await deps.marketBySymbol(symbol);
      if (!market) {
        return sendCcxt(reply, badSymbol(symbol));
      }
      marketId = market.id;
    }
    const limit = parseLimit(req.query.limit, DEFAULT_HISTORY, MAX_HISTORY);
    const sinceParsed = parseSince(req.query.since);
    if (!sinceParsed.ok) {
      return sendCcxt(reply, badRequest(sinceParsed.message, 'trade.invalid_since'));
    }

    try {
      // since → SQL on orders.created_at (timestamptz) via orderHistory.sinceMs.
      const orders = await deps.orderHistory(principal, {
        marketId,
        limit,
        sinceMs: sinceParsed.sinceMs,
      });
      const symbolByMarket = new Map<string, string>();
      const wire = [];
      for (const order of orders) {
        const symbol = await symbolForOrder(order, symbolByMarket, deps.marketById);
        wire.push(presentCcxtOrder(order, symbol));
      }
      return reply.code(200).send(wire);
    } catch (err) {
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });

  app.get<{ Querystring: { symbol?: string; limit?: string; since?: string } }>('/api/v1/account/trades', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;

    const limit = parseLimit(req.query.limit, DEFAULT_FILLS, MAX_FILLS);
    const sinceParsed = parseSince(req.query.since);
    if (!sinceParsed.ok) {
      return sendCcxt(reply, badRequest(sinceParsed.message, 'trade.invalid_since'));
    }
    let filterMarketId: string | undefined;
    const symbolRaw = req.query.symbol;
    if (symbolRaw !== undefined && symbolRaw !== '') {
      const symbol = decodeURIComponent(symbolRaw);
      const market = await deps.marketBySymbol(symbol);
      if (!market) {
        return sendCcxt(reply, badSymbol(symbol));
      }
      filterMarketId = market.id;
    }

    try {
      // Symbol + since resolve in SQL via myFills (fills.market_id, fills.ts),
      // not a post-filter of a user-wide page.
      const fills = await deps.myFills(principal, limit, filterMarketId, sinceParsed.sinceMs);
      const symbolByMarket = new Map<string, string>();
      const wire = [];
      for (const fill of fills) {
        let symbol = symbolByMarket.get(fill.marketId);
        if (symbol === undefined) {
          const market = await deps.marketById(fill.marketId);
          symbol = market?.symbol ?? fill.marketId;
          symbolByMarket.set(fill.marketId, symbol);
        }
        wire.push(presentCcxtMyTrade(fill, symbol));
      }
      return reply.code(200).send(wire);
    } catch (err) {
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });

  /**
   * Published maker/taker from `trade.markets`. No ledger, no rank perk
   * personalization — same numbers as public market.taker/maker. Empty
   * listing (or no usable bps) → `{}`, never a fabricated schedule.
   */
  app.get('/api/v1/account/fees', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;

    try {
      // Contract scope trade:read — markets() itself is public data; gate here.
      requireScope(principal, 'trade:read');
      const listed = await deps.markets();
      return reply.code(200).send(presentTradingFees(listed));
    } catch (err) {
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });

  /**
   * Ledger projection for the authenticated user only.
   *
   * Owner is always `principal.userId` from the edge-signed principal — never a
   * query or body field. That is the same self-only rule as openOrders/myFills;
   * the S2S ledger client will answer for any ownerId, so the gate lives here.
   * Read-only: no recipe, no post, no second balance store (Doctrine §0.6).
   */
  app.get('/api/v1/account/balance', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;

    try {
      requireScope(principal, 'trade:read');
      const rows = await deps.userBalances(principal.userId);
      return reply.code(200).send(presentCcxtBalances(rows));
    } catch (err) {
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });

  /**
   * Derivatives positions — REST_ROUTES.fetchPositions.
   *
   * Lists open and closing rows from trade.positions (F2/F3). Empty [] when none —
   * never invents leverage/mark. `closing` is a voluntary exit waiting on a mark
   * (ADR 2026-08-07) and must not look like a normal open. Optional ?symbol= filters.
   */
  app.get<{ Querystring: { symbol?: string } }>('/api/v1/positions', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;

    try {
      requireScope(principal, 'trade:read');
      const rows = await deps.listPositions(principal, req.query.symbol);
      return reply.code(200).send(rows);
    } catch (err) {
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });

  /**
   * Open a funded futures position (margin via ledger recipes).
   *
   * The entry price is NOT a parameter. It is read from the mark source, and a
   * body that carries one is refused before anything is locked.
   */
  app.post('/api/v1/positions', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;
    if (!requireTradeJurisdiction(req, reply, principal)) return;

    try {
      requireScope(principal, 'trade:write');
      const body = (req.body ?? {}) as Record<string, unknown>;

      // Refused first, before any other validation: a caller who sent a price
      // should hear about the price, not about a field they got right.
      const supplied = suppliedPriceFields(body);
      if (supplied.length > 0) {
        return reply.code(400).send(priceNotAcceptedBody(supplied));
      }

      const symbol = typeof body.symbol === 'string' ? body.symbol : '';
      const side = body.side === 'long' || body.side === 'short' ? body.side : null;
      const size = typeof body.size === 'string' ? body.size : typeof body.contracts === 'string' ? body.contracts : '';
      const leverageRaw = typeof body.leverage === 'string' ? body.leverage.trim() : '';
      if (!leverageRaw) {
        // Isolated entry does not default to 1×. DIRECTION §1 states a ceiling
        // (10×), not a silent substitute when the caller omitted the field.
        // A JSON number here is also refused — parseAmount is for a named string.
        return reply.code(400).send({
          ...badRequest(
            'leverage is required on open — isolated entry does not default to 1x',
            'trade.leverage_required',
          ).body,
        });
      }
      const leverage = leverageRaw;

      const marginRefusal = crossMarginRefusal(body.marginMode);
      if (marginRefusal) {
        return reply.code(400).send(marginRefusal);
      }
      const marginMode = body.marginMode === 'isolated' ? ('isolated' as const) : undefined;

      if (!symbol || !side || !size) {
        return reply.code(400).send({
          ...badRequest('symbol, side, size|contracts required', 'trade.bad_request').body,
        });
      }
      const clientOpenIdRaw =
        typeof body.clientOpenId === 'string' ? body.clientOpenId : typeof body.clientPositionId === 'string' ? body.clientPositionId : '';
      const clientOpenId = clientOpenIdRaw.trim();
      if (!clientOpenId || clientOpenId.length > 64) {
        return reply.code(400).send({
          ...badRequest('clientOpenId is required (1–64 chars) — omit would double-lock margin on retry', 'trade.client_open_id_required')
            .body,
        });
      }

      const pos = await deps.openPosition(principal, {
        symbol,
        side,
        size,
        leverage,
        marginMode,
        clientOpenId,
      });
      return reply.code(200).send(pos);
    } catch (err) {
      if (err instanceof AdlDisclosureError) {
        return reply.code(err.status).send({ error: err.code, message: err.message });
      }
      if (err instanceof FuturesError) {
        return reply.code(err.status).send({ error: err.code, message: err.message });
      }
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });

  /**
   * DIRECTION:34 — in-product ADL disclosure (copy + ack state).
   * Open is refused until POST …/ack for the current version.
   */
  app.get('/api/v1/futures/adl-disclosure', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;

    try {
      requireScope(principal, 'trade:read');
      const wire = await deps.getAdlDisclosure(principal);
      return reply.code(200).send(wire);
    } catch (err) {
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });

  app.post('/api/v1/futures/adl-disclosure/ack', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;
    if (!requireTradeJurisdiction(req, reply, principal)) return;

    try {
      requireScope(principal, 'trade:write');
      const wire = await deps.ackAdlDisclosure(principal);
      return reply.code(200).send(wire);
    } catch (err) {
      if (err instanceof AdlDisclosureError) {
        return reply.code(err.status).send({ error: err.code, message: err.message });
      }
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });

  app.get('/api/v1/futures/adl-events', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;

    try {
      requireScope(principal, 'trade:read');
      const rows = await deps.listAdlDisclosureEvents(principal);
      return reply.code(200).send(rows);
    } catch (err) {
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });

  /**
   * Delivered margin call for one position (D26-P1-T1b / DIRECTION MVP-2).
   *
   * The liquidation tick raises + delivers into the durable store; this door
   * is how the trader observes it. 404 when none is open (or not theirs) —
   * never a fabricated healthy "no call" body that could be confused with a
   * delivered warning. Undelivered attempts are not exposed here.
   */
  app.get<{ Params: { id: string } }>('/api/v1/positions/:id/margin-call', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;

    try {
      requireScope(principal, 'trade:read');
      const call = await deps.getOpenMarginCall(principal, req.params.id);
      if (!call) {
        return reply.code(404).send({
          error: 'trade.margin_call_not_found',
          message: 'No delivered margin call is open for this position.',
        });
      }
      return reply.code(200).send(call);
    } catch (err) {
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });

  /**
   * Close a position at the CURRENT MARK.
   *
   * `?exitPrice=` used to be required here and was the whole realised PnL — the
   * trader named the number the platform paid them. It is now refused.
   */
  app.delete<{ Params: { id: string }; Querystring: Record<string, string | undefined> }>('/api/v1/positions/:id', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;
    if (!requireTradeJurisdiction(req, reply, principal)) return;

    try {
      requireScope(principal, 'trade:write');

      const supplied = suppliedPriceFields(req.query as Record<string, unknown> | undefined);
      if (supplied.length > 0) {
        return reply.code(400).send(priceNotAcceptedBody(supplied));
      }

      const pos = await deps.closePosition(principal, req.params.id);
      return reply.code(200).send(pos);
    } catch (err) {
      if (err instanceof FuturesError) {
        return reply.code(err.status).send({ error: err.code, message: err.message });
      }
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });

  /**
   * POST leverage / margin-mode still 501: open path sets mode at open time;
   * in-place leverage change is not built (would re-margin live risk).
   */
  const derivativesNotSupported = (what: string, intafacedCode: string) =>
    async function handler(req: FastifyRequest, reply: FastifyReply) {
      const principal = requirePrincipal(req, reply);
      if (!principal) return;

      try {
        requireScope(principal, 'trade:write');
      } catch (err) {
        const sent = sendDomainError(reply, err);
        if (sent) return sent;
        throw err;
      }

      return sendCcxt(reply, notSupported(`${what} is not available: set margin mode at open; live re-leverage not built`, intafacedCode));
    };

  app.post('/api/v1/positions/leverage', derivativesNotSupported('setLeverage', 'trade.leverage_unsupported'));
  app.post('/api/v1/positions/margin-mode', derivativesNotSupported('setMarginMode', 'trade.margin_mode_unsupported'));

  // ── Create (money path) ───────────────────────────────────────────────────

  app.post('/api/v1/orders', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;
    if (!requireTradeJurisdiction(req, reply, principal)) return;

    const parsed = createOrderRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      // CCXT `InvalidOrder`, not `BadRequest`: it is specifically the order
      // that is wrong, and that is the branch a client's order-builder listens
      // on. `issues` rides alongside so the integrator sees which field.
      return reply.code(400).send({
        ...invalidOrder(parsed.error.issues[0]?.message ?? 'invalid create order body').body,
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
    }

    let input: PlaceOrderInput;
    try {
      input = mapCreateOrderBody(parsed.data);
    } catch (err) {
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }

    try {
      const order = await deps.placeOrder(principal, input);
      const market = await deps.marketById(order.marketId);
      const symbol = market?.symbol ?? parsed.data.symbol;
      return reply.code(201).send(presentCcxtOrder(order, symbol));
    } catch (err) {
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });

  // ── Cancel all (static path — before :id is fine; Fastify matches exact) ──

  /**
   * DELETE /api/v1/orders[?symbol=] → TradeService.cancelAllOrders.
   * Same money path as single cancel (engine first, finalize second), sequential.
   * trade:write is enforced inside TradeService; jurisdiction here matches create/cancel.
   */
  app.delete<{ Querystring: { symbol?: string } }>('/api/v1/orders', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;
    if (!requireTradeJurisdiction(req, reply, principal)) return;

    let marketId: string | undefined;
    const symbolRaw = req.query.symbol;
    if (symbolRaw !== undefined && symbolRaw !== '') {
      const symbol = decodeURIComponent(symbolRaw);
      const market = await deps.marketBySymbol(symbol);
      if (!market) {
        return sendCcxt(reply, badSymbol(symbol));
      }
      marketId = market.id;
    }

    try {
      const cancelled = await deps.cancelAllOrders(principal, marketId);
      const symbolByMarket = new Map<string, string>();
      const wire = [];
      for (const order of cancelled) {
        const symbol = await symbolForOrder(order, symbolByMarket, deps.marketById);
        wire.push(presentCcxtOrder(order, symbol));
      }
      return reply.code(200).send(wire);
    } catch (err) {
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });

  // ── By id ─────────────────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/api/v1/orders/:id', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;

    try {
      const order = await deps.getOrder(principal, req.params.id);
      const market = await deps.marketById(order.marketId);
      const symbol = market?.symbol ?? order.marketId;
      return reply.code(200).send(presentCcxtOrder(order, symbol));
    } catch (err) {
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });

  app.delete<{ Params: { id: string } }>('/api/v1/orders/:id', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;
    if (!requireTradeJurisdiction(req, reply, principal)) return;

    try {
      const order = await deps.cancelOrder(principal, req.params.id);
      const market = await deps.marketById(order.marketId);
      const symbol = market?.symbol ?? order.marketId;
      return reply.code(200).send(presentCcxtOrder(order, symbol));
    } catch (err) {
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });
}

/** Test helper — build a minimal open OrderRecord. */
export function fakeOrder(partial: {
  id?: string;
  userId?: string;
  marketId?: string;
  clientOrderId?: string | null;
  side?: OrderRecord['side'];
  type?: OrderRecord['type'];
  price?: OrderRecord['price'];
  qty?: OrderRecord['qty'];
  filledQty?: OrderRecord['filledQty'];
  status?: OrderRecord['status'];
  tif?: OrderRecord['tif'];
  protectionPrice?: OrderRecord['protectionPrice'];
  createdAt?: Date;
}): OrderRecord {
  const qty = partial.qty ?? 1_000_000_000_000_000_000n; // 1.0
  return {
    id: partial.id ?? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userId: partial.userId ?? '11111111-1111-4111-8111-111111111111',
    subAccountId: null,
    marketId: partial.marketId ?? '00000000-0000-4000-8000-000000000001',
    clientOrderId: partial.clientOrderId === undefined ? 'cli-1' : partial.clientOrderId,
    side: partial.side ?? 'buy',
    type: partial.type ?? 'limit',
    price: partial.price === undefined ? 100_000_000_000_000_000_000n : partial.price, // 100.0
    qty,
    filledQty: partial.filledQty ?? 0n,
    status: partial.status ?? 'open',
    tif: partial.tif ?? 'GTC',
    holdAsset: 'USDT',
    holdAmount: 100_000_000_000_000_000_000n,
    feeDiscountBps: 0,
    protectionPrice: partial.protectionPrice === undefined ? null : partial.protectionPrice,
    engineSequence: 1,
    seeded: false,
    rejectCode: null,
    createdAt: partial.createdAt ?? new Date('2023-11-14T22:13:20.000Z'),
  };
}

/** Test helper — one fill for private trade wire. */
export function fakeFill(partial: {
  id?: string;
  orderId?: string;
  marketId?: string;
  userId?: string;
  side?: FillRecord['side'];
  liquidity?: FillRecord['liquidity'];
  price?: FillRecord['price'];
  qty?: FillRecord['qty'];
  quoteAmount?: FillRecord['quoteAmount'];
  feeAsset?: string;
  feeAmount?: FillRecord['feeAmount'];
  feeBps?: number;
  ts?: Date;
}): FillRecord {
  return {
    id: partial.id ?? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    orderId: partial.orderId ?? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    counterOrderId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    marketId: partial.marketId ?? '00000000-0000-4000-8000-000000000001',
    userId: partial.userId ?? '11111111-1111-4111-8111-111111111111',
    side: partial.side ?? 'buy',
    liquidity: partial.liquidity ?? 'taker',
    price: partial.price ?? 100_000_000_000_000_000_000n,
    qty: partial.qty ?? 1_000_000_000_000_000_000n,
    quoteAmount: partial.quoteAmount ?? 100_000_000_000_000_000_000n,
    feeAsset: partial.feeAsset ?? 'USDT',
    feeAmount: partial.feeAmount ?? 100_000_000_000_000_000n, // 0.1
    feeBps: partial.feeBps ?? 10,
    sequence: 1,
    ts: partial.ts ?? new Date('2023-11-14T22:13:20.000Z'),
  };
}
