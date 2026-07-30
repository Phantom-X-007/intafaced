import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AuthError, type Principal } from '@intafaced/auth';
import { createEdgeContext, type EdgeRequest } from '@intafaced/contracts';
import { formatAmount, mul } from '@intafaced/ledger-client';
import type { Market, OrderRecord, OrderStatus } from './spot/types.js';

/**
 * Private CCXT-style REST (trade.ccxt-api — authenticated).
 *
 * Paths match `REST_ROUTES` in `@intafaced/exchange-contract`:
 *   GET /api/v1/orders/open   scope: trade:read
 *
 * Auth is the mount boundary: edge terminates the bearer (JWT or API key) and
 * forwards a signed principal on every `/api/*` hop. This service never parses
 * the caller's token — it verifies the edge signature via `createEdgeContext`,
 * exactly like the tRPC mount. A self-asserted principal header is anonymous.
 */

export interface PrivateRestDeps {
  /** Shared EDGE_PRINCIPAL_SECRET — same value tRPC uses. */
  edgeSecret: string;
  serviceName: string;
  openOrders(principal: Principal, marketId?: string): Promise<OrderRecord[]>;
  marketBySymbol(symbol: string): Promise<Market | null>;
  /** Resolve symbol for an order's marketId (open-order wire needs the unified form). */
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
 * CCXT `Order` shape (decimal strings). Fees/trades omitted on the open list —
 * those need fill rows; bots re-fetch when status leaves `open`.
 */
export function presentCcxtOrder(order: OrderRecord, symbol: string) {
  const ts = order.createdAt.getTime();
  const amount = formatAmount(order.qty);
  const filled = formatAmount(order.filledQty);
  const remaining = formatAmount(order.qty - order.filledQty);
  // Cost only when something filled at a known price; open unfilled → "0".
  const price = order.price === null ? null : formatAmount(order.price);
  const cost =
    order.filledQty === 0n || order.price === null ? '0' : formatAmount(mul(order.price, order.filledQty));

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

/**
 * Register private REST routes. Requires a real edge secret (≥32 chars) —
 * same boot bar as tRPC via `createEdgeContext`.
 */
export function registerPrivateRest(app: FastifyInstance, deps: PrivateRestDeps): void {
  const edgeContext = createEdgeContext({ secret: deps.edgeSecret, serviceName: deps.serviceName });

  function principalFrom(req: FastifyRequest): Principal | null {
    const edgeReq: EdgeRequest = {
      headers: req.headers as Record<string, string | string[] | undefined>,
      id: req.id,
    };
    return edgeContext(edgeReq).principal;
  }

  app.get<{ Querystring: { symbol?: string } }>('/api/v1/orders/open', async (req, reply) => {
    const principal = principalFrom(req);
    if (!principal) {
      // Missing / forged / expired edge principal. Edge may have already
      // stripped a bad bearer; we still refuse rather than invent an owner.
      return reply.code(401).send({ code: 'Unauthorized', message: 'Authentication required' });
    }

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
      // Resolve symbols per marketId. Open sets are small; one lookup per distinct market is fine.
      const symbolByMarket = new Map<string, string>();
      const wire = [];
      for (const order of orders) {
        let symbol = symbolByMarket.get(order.marketId);
        if (symbol === undefined) {
          const market = await deps.marketById(order.marketId);
          symbol = market?.symbol ?? order.marketId;
          symbolByMarket.set(order.marketId, symbol);
        }
        wire.push(presentCcxtOrder(order, symbol));
      }
      return reply.code(200).send(wire);
    } catch (err) {
      if (err instanceof AuthError) {
        // requireScope / mfa — never 500 a permission miss.
        const status = err.code === 'mfa.required' ? 401 : 403;
        return reply.code(status).send({ code: err.code, message: err.message });
      }
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
