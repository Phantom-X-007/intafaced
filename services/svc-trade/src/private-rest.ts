import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthError, type Principal } from '@intafaced/auth';
import { checkAccess } from '@intafaced/config';
import { createEdgeContext, type Context, type EdgeRequest } from '@intafaced/contracts';
import { createOrderRequestSchema, type CreateOrderRequest } from '@intafaced/exchange-contract';
import { formatAmount, mul, parseAmount, InsufficientFundsError, LedgerError, MoneyError } from '@intafaced/ledger-client';
import type { PlaceOrderInput } from './spot/trade-service.js';
import { TradeError, type FillRecord, type Market, type OrderRecord, type OrderStatus } from './spot/types.js';

/**
 * Private CCXT-style REST (trade.ccxt-api — authenticated).
 *
 * Paths match `REST_ROUTES` in `@intafaced/exchange-contract`:
 *   GET    /api/v1/orders/open     scope: trade:read
 *   GET    /api/v1/orders/closed   scope: trade:read
 *   GET    /api/v1/orders/:id      scope: trade:read
 *   POST   /api/v1/orders          scope: trade:write + jurisdiction(module=trade)
 *   DELETE /api/v1/orders/:id      scope: trade:write + jurisdiction(module=trade)
 *   GET    /api/v1/account/trades  scope: trade:read
 *
 * Auth is the mount boundary: edge terminates the bearer (JWT or API key) and
 * forwards a signed principal on every `/api/*` hop. This service never parses
 * the caller's token — it verifies the edge signature via `createEdgeContext`,
 * exactly like the tRPC mount. A self-asserted principal header is anonymous.
 *
 * Money path: create/cancel call `TradeService.placeOrder` / `cancelOrder`
 * only — no second hold path, no balances outside the ledger.
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
  orderHistory(principal: Principal, input: { marketId?: string; limit?: number }): Promise<OrderRecord[]>;
  getOrder(principal: Principal, orderId: string): Promise<OrderRecord>;
  placeOrder(principal: Principal, input: PlaceOrderInput): Promise<OrderRecord>;
  cancelOrder(principal: Principal, orderId: string): Promise<OrderRecord>;
  myFills(principal: Principal, limit: number): Promise<FillRecord[]>;
  marketBySymbol(symbol: string): Promise<Market | null>;
  /** Resolve symbol for an order's marketId (wire needs the unified form). */
  marketById(marketId: string): Promise<Market | null>;
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

  app.get<{ Querystring: { symbol?: string; limit?: string } }>('/api/v1/orders/closed', async (req, reply) => {
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

    try {
      const orders = await deps.orderHistory(principal, { marketId, limit });
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

  app.get<{ Querystring: { symbol?: string; limit?: string } }>('/api/v1/account/trades', async (req, reply) => {
    const principal = requirePrincipal(req, reply);
    if (!principal) return;

    const limit = parseLimit(req.query.limit, DEFAULT_FILLS, MAX_FILLS);
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
      // myFills is user-wide; optional symbol is a client-side filter on marketId.
      const fills = await deps.myFills(principal, limit);
      const filtered = filterMarketId ? fills.filter((f) => f.marketId === filterMarketId) : fills;
      const symbolByMarket = new Map<string, string>();
      const wire = [];
      for (const fill of filtered) {
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
