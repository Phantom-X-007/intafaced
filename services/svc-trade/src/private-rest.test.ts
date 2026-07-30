import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { Principal } from '@intafaced/auth';
import { AuthError } from '@intafaced/auth';
import { encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { orderSchema } from '@intafaced/exchange-contract';
import { parseAmount } from '@intafaced/ledger-client';
import {
  fakeOrder,
  presentCcxtOrder,
  registerPrivateRest,
  toCcxtOrderStatus,
  type PrivateRestDeps,
} from './private-rest.js';
import { fakeMarket } from './public-rest.js';

/**
 * Mount boundary for private CCXT REST (docs/decisions/mount-boundary.md).
 *
 * Principal arrives the way index.ts builds it — through createEdgeContext
 * over real headers — not as a Context literal. Unsigned self-asserted
 * principals must stay anonymous and never reach openOrders.
 */

const SECRET = 'a-trade-private-rest-edge-secret-long-enough';
const USER = '11111111-1111-4111-8111-111111111111';

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['trade:read'],
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

describe('toCcxtOrderStatus / presentCcxtOrder', () => {
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
});

describe('private REST — GET /api/v1/orders/open', () => {
  const market = fakeMarket({ id: 'm-btc', symbol: 'BTC/USDT' });
  const open = fakeOrder({
    id: 'ord-1',
    marketId: market.id,
    qty: parseAmount('2'),
    filledQty: parseAmount('0'),
    price: parseAmount('100'),
  });

  function deps(overrides: Partial<PrivateRestDeps> = {}): PrivateRestDeps {
    return {
      edgeSecret: SECRET,
      serviceName: 'svc-trade',
      openOrders: async () => [open],
      marketBySymbol: async (symbol) => (symbol === 'BTC/USDT' ? market : null),
      marketById: async (id) => (id === market.id ? market : null),
      ...overrides,
    };
  }

  async function build(d: PrivateRestDeps = deps()) {
    const app = Fastify();
    registerPrivateRest(app, d);
    await app.ready();
    return app;
  }

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
    expect(res.json().code).toBe('Unauthorized');
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
    const app = await build(
      deps({
        openOrders: async () => {
          read = true;
          return [];
        },
      }),
    );
    const forged = encodePrincipal(
      principal({ scopes: ['trade:read', 'trade:write', 'admin:treasury'], tier: 'full', mfa: true }),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/orders/open',
      headers: {
        'x-intafaced-principal': forged,
        'x-intafaced-region': 'DE',
      },
    });
    expect(res.statusCode).toBe(401);
    expect(read).toBe(false);
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

  it('filters by symbol when provided', async () => {
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
    expect(res.json().code).toBe('MarketNotFound');
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
    // Signed but missing trade:read — service still enforces requireScope.
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/orders/open',
      headers: signedHeaders(principal({ scopes: [] })),
    });
    // openOrders is stubbed to throw; real TradeService would throw the same way.
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('scope.denied');
    await app.close();
  });
});
