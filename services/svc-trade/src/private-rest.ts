import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthError, requireScope, type Principal } from '@intafaced/auth';
import { checkAccess } from '@intafaced/config';
import { createEdgeContext, type Context, type EdgeRequest } from '@intafaced/contracts';
import { createOrderRequestSchema, type CreateOrderRequest } from '@intafaced/exchange-contract';
import {
  formatAmount,
  mul,
  parseAmount,
  InsufficientFundsError,
  LedgerError,
  MoneyError,
  type AccountKind,
  type Balance,
} from '@intafaced/ledger-client';
import type { PlaceOrderInput } from './spot/trade-service.js';
import { TradeError, type FillRecord, type Market, type OrderRecord, type OrderStatus } from './spot/types.js';

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
 *   GET    /api/v1/positions       scope: trade:read  (honest [] until trade.futures)
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
 * CCXT `Order` shape (decimal strings). Fees/trades omitted on list/get unless
 * the fill set is loaded elsewhere — bots re-fetch fills via account/trades.
 */
export function presentCcxtOrder(order: OrderRecord, symbol: string) {
  const ts = order.createdAt.getTime();
  const amount = formatAmount(order.qty);
  const filled = formatAmount(order.filledQty);
  const remaining = formatAmount(order.qty - order.filledQty);
  // Cost only when something filled at a known price; open unfilled → "0".
  const price = order.price === null ? null : formatAmount(order.price);
  const cost = order.filledQty === 0n || order.price === null ? '0' : formatAmount(mul(order.price, order.filledQty));

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

/**
 * Domain → HTTP for private REST. Same branching as the tRPC guard so bots
 * retry on the right codes (insufficient funds is NOT retryable).
 */
function sendDomainError(reply: FastifyReply, err: unknown): FastifyReply | null {
  if (err instanceof AuthError) {
    const status = err.code === 'mfa.required' ? 401 : 403;
    return reply.code(status).send({ code: err.code, message: err.message });
  }
  if (err instanceof TradeError) {
    switch (err.code) {
      case 'trade.market_not_found':
      case 'trade.order_not_found':
        return reply.code(404).send({ code: err.code, message: err.message });
      case 'trade.not_owner':
      case 'trade.spot_disabled':
      case 'trade.market_not_tradable':
      case 'trade.market_kind_unsupported':
        return reply.code(403).send({ code: err.code, message: err.message });
      case 'trade.perks_unavailable':
      case 'trade.dust_fill':
      case 'trade.hold_uncovered':
        return reply.code(500).send({ code: err.code, message: err.message });
      default:
        return reply.code(400).send({ code: err.code, message: err.message });
    }
  }
  if (err instanceof InsufficientFundsError) {
    return reply.code(400).send({ code: err.code, message: err.message });
  }
  if (err instanceof LedgerError || err instanceof MoneyError) {
    return reply.code(400).send({ code: err.name, message: err.message });
  }
  return null;
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
      void reply.code(401).send({ code: 'Unauthorized', message: 'Authentication required' });
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
      void reply.code(403).send({
        code: decision.code,
        message: decision.reason,
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
        return reply.code(404).send({ code: 'MarketNotFound', message: `market ${symbol} not found` });
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

  app.get<{ Querystring: { symbol?: string; limit?: string; since?: string } }>(
    '/api/v1/orders/closed',
    async (req, reply) => {
      const principal = requirePrincipal(req, reply);
      if (!principal) return;

      let marketId: string | undefined;
      const symbolRaw = req.query.symbol;
      if (symbolRaw !== undefined && symbolRaw !== '') {
        const symbol = decodeURIComponent(symbolRaw);
        const market = await deps.marketBySymbol(symbol);
        if (!market) {
          return reply.code(404).send({ code: 'MarketNotFound', message: `market ${symbol} not found` });
        }
        marketId = market.id;
      }
      const limit = parseLimit(req.query.limit, DEFAULT_HISTORY, MAX_HISTORY);
      const sinceParsed = parseSince(req.query.since);
      if (!sinceParsed.ok) {
        return reply.code(400).send({ code: 'InvalidSince', message: sinceParsed.message });
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
    },
  );

  app.get<{ Querystring: { symbol?: string; limit?: string; since?: string } }>(
    '/api/v1/account/trades',
    async (req, reply) => {
      const principal = requirePrincipal(req, reply);
      if (!principal) return;

      const limit = parseLimit(req.query.limit, DEFAULT_FILLS, MAX_FILLS);
      const sinceParsed = parseSince(req.query.since);
      if (!sinceParsed.ok) {
        return reply.code(400).send({ code: 'InvalidSince', message: sinceParsed.message });
      }
      let filterMarketId: string | undefined;
      const symbolRaw = req.query.symbol;
      if (symbolRaw !== undefined && symbolRaw !== '') {
        const symbol = decodeURIComponent(symbolRaw);
        const market = await deps.marketBySymbol(symbol);
        if (!market) {
          return reply.code(404).send({ code: 'MarketNotFound', message: `market ${symbol} not found` });
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
    },
  );

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
   * Spot-only honesty: trade.futures is not built, so there are no positions.
   * Edge-signed principal + trade:read required (same fail-closed gate as open
   * orders). Always 200 + []. Optional ?symbol= is accepted and ignored so
   * CCXT clients that pass a filter still get a valid empty list, not 404.
   * Does NOT invent leverage/margin state (setLeverage/setMarginMode not mounted).
   */
  app.get<{ Querystring: { symbol?: string } }>('/api/v1/positions', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;

    try {
      requireScope(principal, 'trade:read');
      // symbol query intentionally unused — no position store to filter.
      void req.query.symbol;
      return reply.code(200).send([]);
    } catch (err) {
      const sent = sendDomainError(reply, err);
      if (sent) return sent;
      throw err;
    }
  });

  // ── Create (money path) ───────────────────────────────────────────────────

  app.post('/api/v1/orders', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;
    if (!requireTradeJurisdiction(req, reply, principal)) return;

    const parsed = createOrderRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'ValidationError',
        message: parsed.error.issues[0]?.message ?? 'invalid create order body',
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
        return reply.code(404).send({ code: 'MarketNotFound', message: `market ${symbol} not found` });
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
    protectionPrice: null,
    engineSequence: 1,
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
