import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { Principal } from '@intafaced/auth';
import { AuthError } from '@intafaced/auth';
import { encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { balancesSchema, orderSchema, tradeSchema, tradingFeeSchema } from '@intafaced/exchange-contract';
import { parseAmount, type Balance } from '@intafaced/ledger-client';
import {
  crossMarginRefusal,
  fakeFill,
  fakeOrder,
  mapCreateOrderBody,
  presentCcxtBalances,
  presentCcxtMyTrade,
  presentCcxtOrder,
  presentCcxtTradingFee,
  presentTradingFees,
  registerPrivateRest,
  suppliedPriceFields,
  toCcxtOrderStatus,
  type PrivateRestDeps,
} from './private-rest.js';
import { TradeError } from './spot/types.js';
import type { PlaceOrderInput } from './spot/trade-service.js';
import { fakeMarket } from './public-rest.js';

/**
 * Mount boundary for private CCXT REST (docs/decisions/mount-boundary.md).
 *
 * Principal arrives the way index.ts builds it — through createEdgeContext
 * over real headers — not as a Context literal. Unsigned self-asserted
 * principals must stay anonymous and never reach placeOrder / openOrders.
 */

const SECRET = 'a-trade-private-rest-edge-secret-long-enough';
const USER = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['trade:read', 'trade:write'],
    tier: 'basic',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

function signedHeaders(p: Principal = principal(), region = 'DE'): Record<string, string> {
  const raw = encodePrincipal(p);
  return {
    'x-intafaced-principal': raw,
    'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, region),
    'x-intafaced-region': region,
  };
}

describe('toCcxtOrderStatus / presentCcxtOrder / presentCcxtMyTrade / fees', () => {
  it('maps internal statuses onto the CCXT order schema vocabulary', () => {
    expect(toCcxtOrderStatus('pending')).toBe('open');
    expect(toCcxtOrderStatus('open')).toBe('open');
    expect(toCcxtOrderStatus('filled')).toBe('closed');
    expect(toCcxtOrderStatus('cancelled')).toBe('canceled');
    expect(toCcxtOrderStatus('rejected')).toBe('rejected');
    expect(toCcxtOrderStatus('expired')).toBe('expired');
  });

  it('presents an order that validates against orderSchema with decimal strings', () => {
    const order = fakeOrder({
      qty: parseAmount('1.5'),
      filledQty: parseAmount('0.5'),
      price: parseAmount('100'),
      tif: 'PO',
    });
    const wire = presentCcxtOrder(order, 'BTC/USDT');
    expect(orderSchema.safeParse(wire).success).toBe(true);
    expect(wire.symbol).toBe('BTC/USDT');
    expect(wire.amount).toBe('1.5');
    expect(wire.filled).toBe('0.5');
    expect(wire.remaining).toBe('1');
    expect(wire.cost).toBe('50');
    expect(wire.postOnly).toBe(true);
    expect(wire.status).toBe('open');
    expect(typeof wire.price).toBe('string');
    expect(typeof wire.amount).toBe('string');
  });

  it('filled market order cost uses protectionPrice when limit price is null (R6)', () => {
    const order = fakeOrder({
      type: 'market',
      price: null,
      protectionPrice: parseAmount('100'),
      qty: parseAmount('2'),
      filledQty: parseAmount('2'),
      status: 'filled',
    });
    const wire = presentCcxtOrder(order, 'BTC/USDT');
    expect(orderSchema.safeParse(wire).success).toBe(true);
    expect(wire.price).toBeNull();
    expect(wire.cost).toBe('200');
    expect(wire.cost).not.toBe('0');
  });

  it('filled market sell without fills: cost is null, never confident "0" (PEACE residual)', () => {
    const order = fakeOrder({
      type: 'market',
      side: 'sell',
      price: null,
      protectionPrice: null,
      qty: parseAmount('1.5'),
      filledQty: parseAmount('1.5'),
      status: 'filled',
    });
    const wire = presentCcxtOrder(order, 'BTC/USDT');
    expect(orderSchema.safeParse(wire).success).toBe(true);
    expect(wire.price).toBeNull();
    expect(wire.cost).toBeNull();
    expect(wire.cost).not.toBe('0');
  });

  it('unfilled market sell still reports cost "0" (nothing moved)', () => {
    const order = fakeOrder({
      type: 'market',
      side: 'sell',
      price: null,
      protectionPrice: null,
      qty: parseAmount('1'),
      filledQty: parseAmount('0'),
      status: 'open',
    });
    const wire = presentCcxtOrder(order, 'BTC/USDT');
    expect(orderSchema.safeParse(wire).success).toBe(true);
    expect(wire.cost).toBe('0');
  });

  it('filled market sell with fills loaded: cost is Σ fill quoteAmount', () => {
    const order = fakeOrder({
      type: 'market',
      side: 'sell',
      price: null,
      protectionPrice: null,
      qty: parseAmount('2'),
      filledQty: parseAmount('2'),
      status: 'filled',
    });
    const fills = [
      fakeFill({ quoteAmount: parseAmount('100.5'), qty: parseAmount('1') }),
      fakeFill({ quoteAmount: parseAmount('99.5'), qty: parseAmount('1') }),
    ];
    const wire = presentCcxtOrder(order, 'BTC/USDT', { fills });
    expect(orderSchema.safeParse(wire).success).toBe(true);
    expect(wire.cost).toBe('200');
    expect(wire.cost).not.toBe('0');
  });

  it('presents a fill that validates against tradeSchema with decimal strings', () => {
    const fill = fakeFill({
      price: parseAmount('100.5'),
      qty: parseAmount('1.2'),
      quoteAmount: parseAmount('120.6'),
      feeAmount: parseAmount('0.12'),
      feeBps: 10,
    });
    const wire = presentCcxtMyTrade(fill, 'BTC/USDT');
    expect(tradeSchema.safeParse(wire).success).toBe(true);
    expect(wire.price).toBe('100.5');
    expect(wire.amount).toBe('1.2');
    expect(wire.fee?.rate).toBe('0.001');
    expect(typeof wire.cost).toBe('string');
  });

  it('presents TradingFee from market maker/taker bps (decimal rates, percentage true)', () => {
    const m = fakeMarket({ symbol: 'BTC/USDT', makerBps: 10, takerBps: 20 });
    const wire = presentCcxtTradingFee(m);
    expect(tradingFeeSchema.safeParse(wire).success).toBe(true);
    expect(wire.maker).toBe('0.001');
    expect(wire.taker).toBe('0.002');
    expect(wire.percentage).toBe(true);
    expect(typeof wire.maker).toBe('string');
  });

  it('presentTradingFees keys by symbol and returns {} when listing is empty', () => {
    expect(presentTradingFees([])).toEqual({});
    const m = fakeMarket({ symbol: 'ETH/USDT', makerBps: 5, takerBps: 15 });
    const fees = presentTradingFees([m]);
    expect(Object.keys(fees)).toEqual(['ETH/USDT']);
    expect(tradingFeeSchema.safeParse(fees['ETH/USDT']).success).toBe(true);
  });

  it('presentCcxtBalances maps available→free and hold/escrow/stake/collateral→used', () => {
    const now = new Date('2023-11-14T22:13:20.000Z');
    const rows: Balance[] = [
      {
        account: { ownerType: 'user', ownerId: USER, assetId: 'USDT', kind: 'available' },
        accountId: 'a1',
        amount: parseAmount('1000'),
      },
      {
        account: { ownerType: 'user', ownerId: USER, assetId: 'USDT', kind: 'hold', purpose: 'order:o1' },
        accountId: 'a2',
        amount: parseAmount('100'),
      },
      {
        account: { ownerType: 'user', ownerId: USER, assetId: 'USDT', kind: 'hold', purpose: 'order:o2' },
        accountId: 'a3',
        amount: parseAmount('150'),
      },
      {
        account: { ownerType: 'user', ownerId: USER, assetId: 'IFC', kind: 'stake', purpose: 'token:stake:s1' },
        accountId: 'a4',
        amount: parseAmount('4000'),
      },
      {
        account: { ownerType: 'user', ownerId: USER, assetId: 'BTC', kind: 'escrow', purpose: 'trade:t1' },
        accountId: 'a5',
        amount: parseAmount('0.5'),
      },
      {
        account: { ownerType: 'user', ownerId: USER, assetId: 'ETH', kind: 'collateral' },
        accountId: 'a6',
        amount: parseAmount('2'),
      },
    ];
    const wire = presentCcxtBalances(rows, now);
    expect(balancesSchema.safeParse(wire).success).toBe(true);
    expect(wire.timestamp).toBe(now.getTime());
    expect(wire.datetime).toBe(now.toISOString());
    expect(wire.balances.USDT).toEqual({ free: '1000', used: '250', total: '1250' });
    expect(wire.balances.IFC).toEqual({ free: '0', used: '4000', total: '4000' });
    expect(wire.balances.BTC).toEqual({ free: '0', used: '0.5', total: '0.5' });
    expect(wire.balances.ETH).toEqual({ free: '0', used: '2', total: '2' });
    // Decimal strings only — never JS numbers on the wire.
    for (const entry of Object.values(wire.balances)) {
      expect(typeof entry.free).toBe('string');
      expect(typeof entry.used).toBe('string');
      expect(typeof entry.total).toBe('string');
    }
  });

  it('presentCcxtBalances returns honest empty balances for no ledger rows', () => {
    const wire = presentCcxtBalances([], new Date('2023-11-14T22:13:20.000Z'));
    expect(balancesSchema.safeParse(wire).success).toBe(true);
    expect(wire.balances).toEqual({});
  });
});

describe('mapCreateOrderBody', () => {
  it('maps CCXT create body to PlaceOrderInput with Amount qty/price', () => {
    const input = mapCreateOrderBody({
      symbol: 'BTC/USDT',
      type: 'limit',
      side: 'buy',
      amount: '1.5',
      price: '100',
      timeInForce: 'GTC',
      clientOrderId: 'bot-1',
    });
    expect(input.symbol).toBe('BTC/USDT');
    expect(input.side).toBe('buy');
    expect(input.type).toBe('limit');
    expect(input.qty).toBe(parseAmount('1.5'));
    expect(input.price).toBe(parseAmount('100'));
    expect(input.tif).toBe('GTC');
    expect(input.clientOrderId).toBe('bot-1');
  });

  it('maps postOnly to tif PO', () => {
    const input = mapCreateOrderBody({
      symbol: 'BTC/USDT',
      type: 'limit',
      side: 'sell',
      amount: '1',
      price: '100',
      postOnly: true,
    });
    expect(input.tif).toBe('PO');
  });

  it('rejects stop types at the REST boundary', () => {
    expect(() =>
      mapCreateOrderBody({
        symbol: 'BTC/USDT',
        type: 'stop',
        side: 'buy',
        amount: '1',
        stopPrice: '90',
      }),
    ).toThrow(TradeError);
  });
});

describe('private REST — mount boundary + order write path', () => {
  const market = fakeMarket({ id: 'm-btc', symbol: 'BTC/USDT' });
  const open = fakeOrder({
    id: ORDER_ID,
    marketId: market.id,
    qty: parseAmount('2'),
    filledQty: parseAmount('0'),
    price: parseAmount('100'),
  });
  const closed = fakeOrder({
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    marketId: market.id,
    status: 'filled',
    qty: parseAmount('1'),
    filledQty: parseAmount('1'),
    price: parseAmount('100'),
  });
  const fill = fakeFill({
    orderId: ORDER_ID,
    marketId: market.id,
    qty: parseAmount('1'),
    price: parseAmount('100'),
    quoteAmount: parseAmount('100'),
  });

  function deps(overrides: Partial<PrivateRestDeps> = {}): PrivateRestDeps {
    return {
      edgeSecret: SECRET,
      serviceName: 'svc-trade',
      openOrders: async () => [open],
      orderHistory: async () => [closed],
      getOrder: async () => open,
      placeOrder: async () => open,
      cancelOrder: async () => ({ ...open, status: 'cancelled' }),
      cancelAllOrders: async () => [{ ...open, status: 'cancelled' }],
      myFills: async () => [fill],
      marketBySymbol: async (symbol) => (symbol === 'BTC/USDT' ? market : null),
      marketById: async (id) => (id === market.id ? market : null),
      markets: async () => [market],
      userBalances: async () => [],
      listPositions: async () => [],
      openPosition: async () => {
        throw new Error('openPosition not stubbed');
      },
      closePosition: async () => {
        throw new Error('closePosition not stubbed');
      },
      ...overrides,
    };
  }

  async function build(d: PrivateRestDeps = deps()) {
    const app = Fastify();
    registerPrivateRest(app, d);
    await app.ready();
    return app;
  }

  // ── GET /orders/open (existing) ───────────────────────────────────────────

  it('refuses an anonymous caller and does not read open orders', async () => {
    let read = false;
    const app = await build(
      deps({
        openOrders: async () => {
          read = true;
          return [];
        },
      }),
    );
    const res = await app.inject({ method: 'GET', url: '/api/v1/orders/open' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('AuthenticationError');
    expect(read).toBe(false);
    await app.close();
  });

  /**
   * THE ONE THAT MATTERS.
   *
   * A client-forged principal header (full scopes, mfa) must not open the door.
   * createEdgeContext drops unsigned principals to null — same as tRPC mount.
   */
  it('refuses a self-asserted principal, however privileged it claims to be', async () => {
    let read = false;
    let placed = false;
    const app = await build(
      deps({
        openOrders: async () => {
          read = true;
          return [];
        },
        placeOrder: async () => {
          placed = true;
          return open;
        },
      }),
    );
    const forged = encodePrincipal(principal({ scopes: ['trade:read', 'trade:write', 'admin:treasury'], tier: 'full', mfa: true }));
    const headers = {
      'x-intafaced-principal': forged,
      'x-intafaced-region': 'DE',
    };
    const openRes = await app.inject({ method: 'GET', url: '/api/v1/orders/open', headers });
    expect(openRes.statusCode).toBe(401);
    expect(read).toBe(false);

    const placeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: { symbol: 'BTC/USDT', type: 'limit', side: 'buy', amount: '1', price: '100' },
    });
    expect(placeRes.statusCode).toBe(401);
    expect(placed).toBe(false);
    await app.close();
  });

  it('accepts an edge-signed principal and returns CCXT-shaped open orders', async () => {
    let seenUser: string | null = null;
    const app = await build(
      deps({
        openOrders: async (p) => {
          seenUser = p.userId;
          return [open];
        },
      }),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/orders/open',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(seenUser).toBe(USER);
    const body = res.json() as unknown[];
    expect(body).toHaveLength(1);
    expect(orderSchema.safeParse(body[0]).success).toBe(true);
    expect((body[0] as { symbol: string; status: string }).symbol).toBe('BTC/USDT');
    expect((body[0] as { status: string }).status).toBe('open');
    expect(typeof (body[0] as { amount: string }).amount).toBe('string');
    await app.close();
  });

  it('returns empty array when the principal has no open orders', async () => {
    const app = await build(deps({ openOrders: async () => [] }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/orders/open',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it('filters open orders by symbol when provided', async () => {
    let seenMarket: string | undefined = 'unset';
    const app = await build(
      deps({
        openOrders: async (_p, marketId) => {
          seenMarket = marketId;
          return [];
        },
      }),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/orders/open?symbol=BTC%2FUSDT',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(seenMarket).toBe(market.id);
    await app.close();
  });

  it('404s when symbol filter names an unknown market', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/orders/open?symbol=NOPE%2FUSDT',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('BadSymbol');
    await app.close();
  });

  it('maps AuthError from openOrders to 403 (scope miss)', async () => {
    const app = await build(
      deps({
        openOrders: async () => {
          throw new AuthError('Scope "trade:read" is required', 'scope.denied');
        },
      }),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/orders/open',
      headers: signedHeaders(principal({ scopes: [] })),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('PermissionDenied');
    await app.close();
  });

  // ── POST /orders (create — money path) ────────────────────────────────────

  it('POST /orders: forged principal never reaches placeOrder', async () => {
    let placed = false;
    const app = await build(
      deps({
        placeOrder: async () => {
          placed = true;
          return open;
        },
      }),
    );
    const forged = encodePrincipal(principal({ scopes: ['trade:write'], tier: 'full', mfa: true }));
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: {
        'x-intafaced-principal': forged,
        'x-intafaced-region': 'DE',
        'content-type': 'application/json',
      },
      payload: { symbol: 'BTC/USDT', type: 'limit', side: 'buy', amount: '1', price: '100' },
    });
    expect(res.statusCode).toBe(401);
    expect(placed).toBe(false);
    await app.close();
  });

  it('POST /orders: signed principal places via placeOrder with Amounts (not numbers)', async () => {
    let seen: PlaceOrderInput | null = null;
    let seenUser: string | null = null;
    const app = await build(
      deps({
        placeOrder: async (p, input) => {
          seenUser = p.userId;
          seen = input;
          return open;
        },
      }),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { ...signedHeaders(), 'content-type': 'application/json' },
      payload: {
        symbol: 'BTC/USDT',
        type: 'limit',
        side: 'buy',
        amount: '1.5',
        price: '100.25',
        clientOrderId: 'bot-42',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(seenUser).toBe(USER);
    expect(seen).not.toBeNull();
    expect(seen!.qty).toBe(parseAmount('1.5'));
    expect(seen!.price).toBe(parseAmount('100.25'));
    expect(typeof seen!.qty).toBe('bigint');
    expect(typeof seen!.price).toBe('bigint');
    expect(seen!.clientOrderId).toBe('bot-42');
    const body = res.json() as { symbol: string; amount: string; status: string };
    expect(orderSchema.safeParse(body).success).toBe(true);
    expect(body.symbol).toBe('BTC/USDT');
    expect(typeof body.amount).toBe('string');
    await app.close();
  });

  it('POST /orders: 400 when limit has no price', async () => {
    let placed = false;
    const app = await build(
      deps({
        placeOrder: async () => {
          placed = true;
          return open;
        },
      }),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { ...signedHeaders(), 'content-type': 'application/json' },
      payload: { symbol: 'BTC/USDT', type: 'limit', side: 'buy', amount: '1' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('InvalidOrder');
    expect(placed).toBe(false);
    await app.close();
  });

  it('POST /orders: maps TradeError from placeOrder (insufficient path uses domain codes)', async () => {
    const app = await build(
      deps({
        placeOrder: async () => {
          throw new TradeError('spot trading is disabled by the operator kill-switch', 'trade.spot_disabled');
        },
      }),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { ...signedHeaders(), 'content-type': 'application/json' },
      payload: { symbol: 'BTC/USDT', type: 'market', side: 'buy', amount: '1' },
    });
    // The operator kill-switch is a temporary, venue-wide condition, so CCXT
    // `OnMaintenance` + 503 — a retryable state. It used to answer 403, which a
    // bot reads as "your key may not do this" and gives up on permanently.
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('OnMaintenance');
    expect(res.json().intafacedCode).toBe('trade.spot_disabled');
    await app.close();
  });

  // ── DELETE /orders/:id ────────────────────────────────────────────────────

  it('DELETE /orders/:id: forged → 401, never cancelOrder', async () => {
    let cancelled = false;
    const app = await build(
      deps({
        cancelOrder: async () => {
          cancelled = true;
          return open;
        },
      }),
    );
    const forged = encodePrincipal(principal({ scopes: ['trade:write'] }));
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/orders/${ORDER_ID}`,
      headers: { 'x-intafaced-principal': forged, 'x-intafaced-region': 'DE' },
    });
    expect(res.statusCode).toBe(401);
    expect(cancelled).toBe(false);
    await app.close();
  });

  it('DELETE /orders/:id: signed cancel returns CCXT canceled order', async () => {
    let seenId: string | null = null;
    const app = await build(
      deps({
        cancelOrder: async (_p, id) => {
          seenId = id;
          return { ...open, status: 'cancelled' };
        },
      }),
    );
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/orders/${ORDER_ID}`,
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(seenId).toBe(ORDER_ID);
    const body = res.json() as { status: string };
    expect(orderSchema.safeParse(body).success).toBe(true);
    expect(body.status).toBe('canceled');
    await app.close();
  });

  // ── GET /orders/:id ───────────────────────────────────────────────────────

  it('GET /orders/:id: forged → 401', async () => {
    let fetched = false;
    const app = await build(
      deps({
        getOrder: async () => {
          fetched = true;
          return open;
        },
      }),
    );
    const forged = encodePrincipal(principal());
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${ORDER_ID}`,
      headers: { 'x-intafaced-principal': forged, 'x-intafaced-region': 'DE' },
    });
    expect(res.statusCode).toBe(401);
    expect(fetched).toBe(false);
    await app.close();
  });

  it('GET /orders/:id: signed returns order; not found → 404', async () => {
    const appOk = await build();
    const ok = await appOk.inject({
      method: 'GET',
      url: `/api/v1/orders/${ORDER_ID}`,
      headers: signedHeaders(),
    });
    expect(ok.statusCode).toBe(200);
    expect(orderSchema.safeParse(ok.json()).success).toBe(true);
    await appOk.close();

    const appMiss = await build(
      deps({
        getOrder: async () => {
          throw new TradeError('order missing', 'trade.order_not_found');
        },
      }),
    );
    const miss = await appMiss.inject({
      method: 'GET',
      url: `/api/v1/orders/${ORDER_ID}`,
      headers: signedHeaders(),
    });
    expect(miss.statusCode).toBe(404);
    expect(miss.json().code).toBe('OrderNotFound');
    expect(miss.json().intafacedCode).toBe('trade.order_not_found');
    await appMiss.close();
  });

  // ── GET /orders/closed ────────────────────────────────────────────────────

  it('GET /orders/closed: forged → 401; signed returns closed list', async () => {
    let hist = false;
    const app = await build(
      deps({
        orderHistory: async () => {
          hist = true;
          return [closed];
        },
      }),
    );
    const forged = encodePrincipal(principal());
    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/orders/closed',
      headers: { 'x-intafaced-principal': forged, 'x-intafaced-region': 'DE' },
    });
    expect(denied.statusCode).toBe(401);
    expect(hist).toBe(false);

    const ok = await app.inject({
      method: 'GET',
      url: '/api/v1/orders/closed',
      headers: signedHeaders(),
    });
    expect(ok.statusCode).toBe(200);
    expect(hist).toBe(true);
    const body = ok.json() as unknown[];
    expect(body).toHaveLength(1);
    expect(orderSchema.safeParse(body[0]).success).toBe(true);
    expect((body[0] as { status: string }).status).toBe('closed');
    await app.close();
  });

  // ── GET /account/trades ───────────────────────────────────────────────────

  it('GET /account/trades: forged → 401; signed returns my fills as tradeSchema', async () => {
    let listed = false;
    const app = await build(
      deps({
        myFills: async () => {
          listed = true;
          return [fill];
        },
      }),
    );
    const forged = encodePrincipal(principal());
    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/account/trades',
      headers: { 'x-intafaced-principal': forged, 'x-intafaced-region': 'DE' },
    });
    expect(denied.statusCode).toBe(401);
    expect(listed).toBe(false);

    const ok = await app.inject({
      method: 'GET',
      url: '/api/v1/account/trades',
      headers: signedHeaders(),
    });
    expect(ok.statusCode).toBe(200);
    expect(listed).toBe(true);
    const body = ok.json() as unknown[];
    expect(body).toHaveLength(1);
    expect(tradeSchema.safeParse(body[0]).success).toBe(true);
    expect(typeof (body[0] as { price: string }).price).toBe('string');
    await app.close();
  });

  it('GET /account/trades?symbol=: passes marketId into myFills (SQL filter)', async () => {
    let seenMarket: string | undefined = 'unset';
    let seenLimit: number | undefined;
    const app = await build(
      deps({
        myFills: async (_p, limit, marketId) => {
          seenLimit = limit;
          seenMarket = marketId;
          return [fill];
        },
      }),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/account/trades?symbol=BTC%2FUSDT',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(seenMarket).toBe(market.id);
    expect(seenLimit).toBe(100);
    const body = res.json() as unknown[];
    expect(body).toHaveLength(1);
    expect(tradeSchema.safeParse(body[0]).success).toBe(true);
    expect((body[0] as { symbol: string }).symbol).toBe('BTC/USDT');
    await app.close();
  });

  it('GET /account/trades?symbol=: known market with no fills → 200 []', async () => {
    let seenMarket: string | undefined = 'unset';
    const app = await build(
      deps({
        myFills: async (_p, _limit, marketId) => {
          seenMarket = marketId;
          return [];
        },
      }),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/account/trades?symbol=BTC%2FUSDT',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(seenMarket).toBe(market.id);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it('GET /account/trades?symbol=: unknown market → 404 without myFills', async () => {
    let listed = false;
    const app = await build(
      deps({
        myFills: async () => {
          listed = true;
          return [fill];
        },
      }),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/account/trades?symbol=NOPE%2FUSDT',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('BadSymbol');
    expect(listed).toBe(false);
    await app.close();
  });

  it('GET /account/trades without symbol: myFills gets no marketId (unfiltered)', async () => {
    let seenMarket: string | undefined = 'sentinel';
    const app = await build(
      deps({
        myFills: async (_p, _limit, marketId) => {
          seenMarket = marketId;
          return [fill];
        },
      }),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/account/trades',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(seenMarket).toBeUndefined();
    expect(res.json()).toHaveLength(1);
    await app.close();
  });

  it('GET /account/trades?since=: passes sinceMs into myFills (SQL filter)', async () => {
    let seenSince: number | undefined = -1;
    let seenMarket: string | undefined = 'sentinel';
    const app = await build(
      deps({
        myFills: async (_p, _limit, marketId, sinceMs) => {
          seenMarket = marketId;
          seenSince = sinceMs;
          return [fill];
        },
      }),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/account/trades?since=1700000000000&symbol=BTC%2FUSDT',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(seenSince).toBe(1_700_000_000_000);
    expect(seenMarket).toBe(market.id);
    expect(res.json()).toHaveLength(1);
    await app.close();
  });

  it('GET /account/trades?since=: invalid (NaN / negative) → 400 without myFills', async () => {
    let listed = false;
    const app = await build(
      deps({
        myFills: async () => {
          listed = true;
          return [fill];
        },
      }),
    );
    for (const since of ['not-a-number', '-1', 'NaN']) {
      listed = false;
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/account/trades?since=${encodeURIComponent(since)}`,
        headers: signedHeaders(),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('BadRequest');
      expect(listed).toBe(false);
    }
    await app.close();
  });

  it('GET /orders/closed?since=: passes sinceMs into orderHistory', async () => {
    let seen: { marketId?: string; limit?: number; sinceMs?: number } | null = null;
    const app = await build(
      deps({
        orderHistory: async (_p, input) => {
          seen = input;
          return [closed];
        },
      }),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/orders/closed?since=1700000000000&symbol=BTC%2FUSDT',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(seen).toEqual({ marketId: market.id, limit: 100, sinceMs: 1_700_000_000_000 });
    expect(res.json()).toHaveLength(1);
    await app.close();
  });

  it('GET /orders/closed?since=: invalid (NaN / negative) → 400 without orderHistory', async () => {
    let listed = false;
    const app = await build(
      deps({
        orderHistory: async () => {
          listed = true;
          return [closed];
        },
      }),
    );
    for (const since of ['abc', '-5']) {
      listed = false;
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/orders/closed?since=${encodeURIComponent(since)}`,
        headers: signedHeaders(),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('BadRequest');
      expect(listed).toBe(false);
    }
    await app.close();
  });

  // ── DELETE /orders (cancel all — money path) ──────────────────────────────

  it('DELETE /orders: forged principal never reaches cancelAllOrders', async () => {
    let cancelled = false;
    const app = await build(
      deps({
        cancelAllOrders: async () => {
          cancelled = true;
          return [];
        },
      }),
    );
    const forged = encodePrincipal(principal({ scopes: ['trade:write'], tier: 'full', mfa: true }));
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/orders',
      headers: { 'x-intafaced-principal': forged, 'x-intafaced-region': 'DE' },
    });
    expect(res.statusCode).toBe(401);
    expect(cancelled).toBe(false);
    await app.close();
  });

  it('DELETE /orders: signed cancel-all returns CCXT canceled order list', async () => {
    let seenUser: string | null = null;
    let seenMarket: string | undefined = 'unset';
    const app = await build(
      deps({
        cancelAllOrders: async (p, marketId) => {
          seenUser = p.userId;
          seenMarket = marketId;
          return [{ ...open, status: 'cancelled' }];
        },
      }),
    );
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/orders',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(seenUser).toBe(USER);
    expect(seenMarket).toBeUndefined();
    const body = res.json() as unknown[];
    expect(body).toHaveLength(1);
    expect(orderSchema.safeParse(body[0]).success).toBe(true);
    expect((body[0] as { status: string }).status).toBe('canceled');
    await app.close();
  });

  it('DELETE /orders?symbol=: filters market; unknown symbol → 404 without cancelAll', async () => {
    let seenMarket: string | undefined = 'unset';
    let cancelled = false;
    const app = await build(
      deps({
        cancelAllOrders: async (_p, marketId) => {
          cancelled = true;
          seenMarket = marketId;
          return [];
        },
      }),
    );
    const ok = await app.inject({
      method: 'DELETE',
      url: '/api/v1/orders?symbol=BTC%2FUSDT',
      headers: signedHeaders(),
    });
    expect(ok.statusCode).toBe(200);
    expect(cancelled).toBe(true);
    expect(seenMarket).toBe(market.id);

    cancelled = false;
    const miss = await app.inject({
      method: 'DELETE',
      url: '/api/v1/orders?symbol=NOPE%2FUSDT',
      headers: signedHeaders(),
    });
    expect(miss.statusCode).toBe(404);
    expect(miss.json().code).toBe('BadSymbol');
    expect(cancelled).toBe(false);
    await app.close();
  });

  it('DELETE /orders: empty open book returns [] (honest empty)', async () => {
    const app = await build(deps({ cancelAllOrders: async () => [] }));
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/orders',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  // ── GET /account/fees ─────────────────────────────────────────────────────

  it('GET /account/fees: forged → 401; never lists markets', async () => {
    let listed = false;
    const app = await build(
      deps({
        markets: async () => {
          listed = true;
          return [market];
        },
      }),
    );
    const forged = encodePrincipal(principal({ scopes: ['trade:read'] }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/account/fees',
      headers: { 'x-intafaced-principal': forged, 'x-intafaced-region': 'DE' },
    });
    expect(res.statusCode).toBe(401);
    expect(listed).toBe(false);
    await app.close();
  });

  it('GET /account/fees: signed returns per-symbol TradingFee from market bps', async () => {
    const rich = fakeMarket({ id: market.id, symbol: 'BTC/USDT', makerBps: 10, takerBps: 20 });
    const app = await build(deps({ markets: async () => [rich] }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/account/fees',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body['BTC/USDT']).toBeDefined();
    expect(tradingFeeSchema.safeParse(body['BTC/USDT']).success).toBe(true);
    expect((body['BTC/USDT'] as { maker: string; taker: string }).maker).toBe('0.001');
    expect((body['BTC/USDT'] as { taker: string }).taker).toBe('0.002');
    expect(typeof (body['BTC/USDT'] as { maker: string }).maker).toBe('string');
    await app.close();
  });

  it('GET /account/fees: empty markets → honest empty object', async () => {
    const app = await build(deps({ markets: async () => [] }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/account/fees',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({});
    await app.close();
  });

  // ── GET /account/balance ──────────────────────────────────────────────────

  it('GET /account/balance: forged → 401; never reads ledger', async () => {
    let read = false;
    const app = await build(
      deps({
        userBalances: async () => {
          read = true;
          return [];
        },
      }),
    );
    const forged = encodePrincipal(principal({ scopes: ['trade:read'] }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/account/balance',
      headers: { 'x-intafaced-principal': forged, 'x-intafaced-region': 'DE' },
    });
    expect(res.statusCode).toBe(401);
    expect(read).toBe(false);
    await app.close();
  });

  it('GET /account/balance: scope miss → 403; never reads ledger', async () => {
    let read = false;
    const app = await build(
      deps({
        userBalances: async () => {
          read = true;
          return [];
        },
      }),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/account/balance',
      headers: signedHeaders(principal({ scopes: [] })),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('PermissionDenied');
    expect(read).toBe(false);
    await app.close();
  });

  it('GET /account/balance: signed → self-only userId and balancesSchema wire', async () => {
    let seenUserId: string | undefined;
    const rows: Balance[] = [
      {
        account: { ownerType: 'user', ownerId: USER, assetId: 'USDT', kind: 'available' },
        accountId: 'a1',
        amount: parseAmount('1000'),
      },
      {
        account: { ownerType: 'user', ownerId: USER, assetId: 'USDT', kind: 'hold', purpose: 'order:o1' },
        accountId: 'a2',
        amount: parseAmount('250'),
      },
    ];
    const app = await build(
      deps({
        userBalances: async (userId) => {
          seenUserId = userId;
          return rows;
        },
      }),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/account/balance',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(seenUserId).toBe(USER);
    const body = res.json() as ReturnType<typeof presentCcxtBalances>;
    expect(balancesSchema.safeParse(body).success).toBe(true);
    expect(body.balances.USDT).toEqual({ free: '1000', used: '250', total: '1250' });
    expect(typeof body.balances.USDT!.free).toBe('string');
    await app.close();
  });

  it('GET /account/balance: empty wallet → honest empty balances object', async () => {
    const app = await build(deps({ userBalances: async () => [] }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/account/balance',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { balances: Record<string, unknown> };
    expect(balancesSchema.safeParse(body).success).toBe(true);
    expect(body.balances).toEqual({});
    await app.close();
  });

  // ── GET /positions (open rows; [] when none — F3) ───────────────────────────

  it('GET /positions: anonymous → 401', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/positions' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('AuthenticationError');
    await app.close();
  });

  it('GET /positions: self-asserted principal → 401 (fail closed)', async () => {
    const app = await build();
    const forged = encodePrincipal(principal({ scopes: ['trade:read', 'trade:write'], tier: 'full', mfa: true }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/positions',
      headers: { 'x-intafaced-principal': forged, 'x-intafaced-region': 'DE' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('AuthenticationError');
    await app.close();
  });

  it('GET /positions: scope miss → 403', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/positions',
      headers: signedHeaders(principal({ scopes: [] })),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('PermissionDenied');
    await app.close();
  });

  it('GET /positions: signed principal → 200 + [] when none open', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/positions',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it('GET /positions: returns stubbed open rows', async () => {
    const sample = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      symbol: 'BTC/USDT',
      timestamp: 1,
      datetime: '1970-01-01T00:00:00.001Z',
      side: 'long' as const,
      contracts: '1',
      contractSize: null,
      entryPrice: '50000',
      markPrice: null,
      notional: '50000',
      leverage: '10',
      collateral: '5000',
      initialMargin: '5000',
      maintenanceMargin: null,
      unrealizedPnl: null,
      realizedPnl: null,
      liquidationPrice: null,
      marginMode: 'isolated' as const,
      percentage: null,
    };
    const app = await build(deps({ listPositions: async () => [sample] }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/positions',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([sample]);
    await app.close();
  });

  // ── A caller may not name a price (D-S-01) ──────────────────────────────────

  /**
   * `docs/adr/2026-08-05-futures-risk-and-mark-law.md`, refuse table row 1.
   *
   * Every test here asserts THE SERVICE WAS NEVER CALLED, not merely that the
   * status was 400 — the refusal has to happen before the money path, or it is
   * just a differently worded receipt for the same trade.
   */
  describe('caller-supplied prices are refused, not ignored', () => {
    for (const field of ['entryPrice', 'price', 'markPrice'] as const) {
      it(`POST /positions with ${field} → 400 trade.price_not_accepted, and openPosition is never called`, async () => {
        let called = false;
        const app = await build(
          deps({
            openPosition: async () => {
              called = true;
              throw new Error('should not reach the money path');
            },
          }),
        );
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/positions',
          headers: signedHeaders(),
          payload: { symbol: 'BTC/USDT-PERP', side: 'long', size: '1', leverage: '10', [field]: '1' },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('trade.price_not_accepted');
        expect(res.json().message).toContain(field);
        expect(called).toBe(false);
        await app.close();
      });
    }

    it('names the price field before complaining about anything else the caller got wrong', async () => {
      const app = await build();
      // No symbol, no side, no size — and a price. The price is the answer.
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/positions',
        headers: signedHeaders(),
        payload: { entryPrice: '50000' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('trade.price_not_accepted');
      await app.close();
    });

    it('DELETE /positions/:id?exitPrice= → 400, and closePosition is never called', async () => {
      let called = false;
      const app = await build(
        deps({
          closePosition: async () => {
            called = true;
            throw new Error('should not reach the money path');
          },
        }),
      );
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/positions/${ORDER_ID}?exitPrice=999999`,
        headers: signedHeaders(),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('trade.price_not_accepted');
      expect(res.json().message).toContain('exitPrice');
      expect(called).toBe(false);
      await app.close();
    });

    /**
     * The refusal must not be silently-substitute. A caller who is told "no"
     * can fix their bot; a caller who is told "200 OK" while the platform used
     * a different number keeps sending the price and never finds out.
     */
    it('does not quietly re-price — the refusal explains what to send instead', async () => {
      const app = await build();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/positions/${ORDER_ID}?exitPrice=999999`,
        headers: signedHeaders(),
      });
      expect(res.json().message).toContain('read from the mark source');
      expect(res.json().message).toContain('Resend without it');
      await app.close();
    });

    it('DELETE with no price closes at the mark — the happy path still works', async () => {
      const seen: string[] = [];
      const app = await build(
        deps({
          closePosition: async (_p, id) => {
            seen.push(id);
            return { id, symbol: 'BTC/USDT-PERP' } as never;
          },
        }),
      );
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/positions/${ORDER_ID}`,
        headers: signedHeaders(),
      });
      expect(res.statusCode).toBe(200);
      expect(seen).toEqual([ORDER_ID]);
      await app.close();
    });

    it('POST with no price opens at the mark, and no price reaches the service', async () => {
      const seen: Record<string, unknown>[] = [];
      const app = await build(
        deps({
          openPosition: async (_p, input) => {
            seen.push(input as unknown as Record<string, unknown>);
            return { id: 'pos-1', symbol: input.symbol } as never;
          },
        }),
      );
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/positions',
        headers: signedHeaders(),
        payload: { symbol: 'BTC/USDT-PERP', side: 'long', size: '1', leverage: '10' },
      });
      expect(res.statusCode).toBe(200);
      expect(seen).toHaveLength(1);
      for (const forbidden of ['entryPrice', 'exitPrice', 'price', 'markPrice']) {
        expect(seen[0]).not.toHaveProperty(forbidden);
      }
      await app.close();
    });

    it('an unauthenticated caller is still refused first — the price check does not open a hole', async () => {
      const app = await build();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/positions',
        payload: { symbol: 'BTC/USDT-PERP', side: 'long', size: '1', entryPrice: '1' },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });
  });

  // ── Isolated margin only (DIRECTION §1, ADR done bar 8) ─────────────────────

  describe('cross margin is refused, not coerced', () => {
    it('POST /positions with marginMode cross → 400, and openPosition is never called', async () => {
      let called = false;
      const app = await build(
        deps({
          openPosition: async () => {
            called = true;
            throw new Error('should not open a cross-margin position');
          },
        }),
      );
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/positions',
        headers: signedHeaders(),
        payload: { symbol: 'BTC/USDT-PERP', side: 'long', size: '1', leverage: '10', marginMode: 'cross' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('trade.cross_margin_unsupported');
      expect(called).toBe(false);
      await app.close();
    });

    /**
     * The dangerous shape: accepting `cross` and quietly writing `isolated`.
     * The caller believes their whole balance backs the position. It does not.
     */
    it('does not silently downgrade cross to isolated', async () => {
      const seen: unknown[] = [];
      const app = await build(
        deps({
          openPosition: async (_p, input) => {
            seen.push(input.marginMode);
            return {} as never;
          },
        }),
      );
      await app.inject({
        method: 'POST',
        url: '/api/v1/positions',
        headers: signedHeaders(),
        payload: { symbol: 'BTC/USDT-PERP', side: 'long', size: '1', marginMode: 'cross' },
      });
      expect(seen).toEqual([]);
      await app.close();
    });

    it('still accepts isolated, and omitting it', async () => {
      const seen: unknown[] = [];
      const app = await build(
        deps({
          openPosition: async (_p, input) => {
            seen.push(input.marginMode);
            return {} as never;
          },
        }),
      );
      for (const payload of [
        { symbol: 'BTC/USDT-PERP', side: 'long', size: '1', marginMode: 'isolated' },
        { symbol: 'BTC/USDT-PERP', side: 'long', size: '1' },
      ]) {
        const res = await app.inject({ method: 'POST', url: '/api/v1/positions', headers: signedHeaders(), payload });
        expect(res.statusCode).toBe(200);
      }
      expect(seen).toEqual(['isolated', undefined]);
      await app.close();
    });

    it('refuses an unrecognised margin mode rather than defaulting it', async () => {
      const app = await build();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/positions',
        headers: signedHeaders(),
        payload: { symbol: 'BTC/USDT-PERP', side: 'long', size: '1', marginMode: 'portfolio' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('trade.bad_request');
      await app.close();
    });
  });

  describe('crossMarginRefusal', () => {
    it('passes isolated and undefined, refuses cross and anything else', () => {
      expect(crossMarginRefusal(undefined)).toBeNull();
      expect(crossMarginRefusal('isolated')).toBeNull();
      expect(crossMarginRefusal('cross')?.error).toBe('trade.cross_margin_unsupported');
      expect(crossMarginRefusal('CROSS')?.error).toBe('trade.bad_request');
      expect(crossMarginRefusal(null)?.error).toBe('trade.bad_request');
    });

    it('explains why coercion would be worse than refusal', () => {
      expect(crossMarginRefusal('cross')!.message).toContain('misreport what is backing it');
    });
  });

  describe('suppliedPriceFields', () => {
    it('finds every forbidden field a request carries, and nothing else', () => {
      expect(suppliedPriceFields({ symbol: 'BTC/USDT', size: '1' })).toEqual([]);
      expect(suppliedPriceFields({ entryPrice: '1', exitPrice: '2' })).toEqual(['entryPrice', 'exitPrice']);
      expect(suppliedPriceFields(null)).toEqual([]);
      expect(suppliedPriceFields(undefined)).toEqual([]);
    });

    it('catches an EMPTY price too — sending the field at all is the mistake', () => {
      expect(suppliedPriceFields({ exitPrice: '' })).toEqual(['exitPrice']);
      expect(suppliedPriceFields({ entryPrice: null })).toEqual(['entryPrice']);
    });
  });

  // ── setLeverage / setMarginMode ───────────────────────────────────────────

  /**
   * Both are declared in REST_ROUTES and were not mounted at all, so a CCXT
   * client got Fastify's generic 404 — which reads as a bad URL or a broken
   * deploy rather than an unsupported capability.
   *
   * Accepting them with a 200 would be far worse than either: a bot would
   * believe it had set 10x leverage and size its next order against margin
   * that does not exist.
   */
  for (const [path, intafacedCode] of [
    ['/api/v1/positions/leverage', 'trade.leverage_unsupported'],
    ['/api/v1/positions/margin-mode', 'trade.margin_mode_unsupported'],
  ] as const) {
    it(`POST ${path}: signed → 501 NotSupported, never a silent success`, async () => {
      const app = await build();
      const res = await app.inject({
        method: 'POST',
        url: path,
        headers: { ...signedHeaders(), 'content-type': 'application/json' },
        payload: { symbol: 'BTC/USDT', leverage: '10', marginMode: 'cross' },
      });
      expect(res.statusCode).toBe(501);
      expect(res.json().code).toBe('NotSupported');
      expect(res.json().intafacedCode).toBe(intafacedCode);
      await app.close();
    });

    it(`POST ${path}: anonymous → 401 (capabilities are not enumerable unauthenticated)`, async () => {
      const app = await build();
      const res = await app.inject({
        method: 'POST',
        url: path,
        headers: { 'content-type': 'application/json' },
        payload: { symbol: 'BTC/USDT' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('AuthenticationError');
      await app.close();
    });

    it(`POST ${path}: scope miss → 403 before the capability answer`, async () => {
      const app = await build();
      const res = await app.inject({
        method: 'POST',
        url: path,
        headers: { ...signedHeaders(principal({ scopes: ['trade:read'] })), 'content-type': 'application/json' },
        payload: { symbol: 'BTC/USDT' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('PermissionDenied');
      await app.close();
    });
  }

  it('GET /positions?symbol=: still returns [] (filter accepted, no invent)', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/positions?symbol=BTC%2FUSDT',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });
});
