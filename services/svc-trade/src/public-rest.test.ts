import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { marketSchema, orderBookSchema } from '@intafaced/exchange-contract';
import { parseAmount } from '@intafaced/ledger-client';
import {
  bpsToRate,
  decimalPlaces,
  fakeMarket,
  presentCcxtMarket,
  presentOrderBook,
  registerPublicRest,
  type PublicRestDeps,
} from './public-rest.js';
import { MatchingUnavailableError } from './spot/matching-client.js';

describe('bpsToRate / decimalPlaces', () => {
  it('converts integer bps to a decimal rate string', () => {
    expect(bpsToRate(10)).toBe('0.001');
    expect(bpsToRate(20)).toBe('0.002');
    expect(bpsToRate(100)).toBe('0.01');
    expect(bpsToRate(0)).toBe('0');
    expect(bpsToRate(1)).toBe('0.0001');
  });

  it('counts significant fractional places', () => {
    expect(decimalPlaces('0.01')).toBe(2);
    expect(decimalPlaces('0.0001')).toBe(4);
    expect(decimalPlaces('1')).toBe(0);
    expect(decimalPlaces('0.0100')).toBe(2);
  });
});

describe('presenters', () => {
  it('presents a market that validates against the CCXT market schema', () => {
    const wire = presentCcxtMarket(
      fakeMarket({
        symbol: 'BTC/USDT',
        tickSize: parseAmount('0.01'),
        lotSize: parseAmount('0.0001'),
        makerBps: 10,
        takerBps: 20,
      }),
    );
    expect(marketSchema.safeParse(wire).success).toBe(true);
    expect(wire.maker).toBe('0.001');
    expect(wire.taker).toBe('0.002');
    expect(wire.precision.price).toBe(2);
    expect(wire.precision.amount).toBe(4);
    expect(wire.limits.amount.min).toBe('0.0001');
    // Money fields are decimal strings, never numbers.
    expect(typeof wire.maker).toBe('string');
    expect(typeof wire.limits.cost.min).toBe('string');
  });

  it('presents depth as a CCXT order book with decimal-string levels', () => {
    const wire = presentOrderBook(
      'BTC/USDT',
      {
        bids: [
          ['100.5', '1.2'],
          ['100', '3'],
        ],
        asks: [['101', '0.5']],
        sequence: 42,
      },
      1_700_000_000_000,
    );
    expect(orderBookSchema.safeParse(wire).success).toBe(true);
    expect(wire.nonce).toBe(42);
    expect(wire.bids[0]).toEqual(['100.5', '1.2']);
    expect(typeof wire.bids[0]![0]).toBe('string');
    expect(typeof wire.bids[0]![1]).toBe('string');
  });
});

describe('public REST routes', () => {
  const market = fakeMarket({ id: 'm-btc', symbol: 'BTC/USDT' });

  function deps(overrides: Partial<PublicRestDeps> = {}): PublicRestDeps {
    return {
      markets: async () => [market],
      marketBySymbol: async (symbol) => (symbol === 'BTC/USDT' ? market : null),
      depth: async () => ({
        bids: [['100', '2']],
        asks: [['101', '1.5']],
        sequence: 7,
      }),
      now: () => 1_700_000_000_000,
      ...overrides,
    };
  }

  async function build(d: PublicRestDeps = deps()) {
    const app = Fastify();
    registerPublicRest(app, d);
    await app.ready();
    return app;
  }

  it('GET /api/v1/markets lists markets with no auth', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/markets' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as unknown[];
    expect(body).toHaveLength(1);
    expect(marketSchema.safeParse(body[0]).success).toBe(true);
    expect((body[0] as { symbol: string }).symbol).toBe('BTC/USDT');
    await app.close();
  });

  it('GET /api/v1/orderbook/:symbol returns depth with decimal strings', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/orderbook/BTC%2FUSDT?limit=10' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(orderBookSchema.safeParse(body).success).toBe(true);
    expect(body.symbol).toBe('BTC/USDT');
    expect(body.nonce).toBe(7);
    expect(body.bids).toEqual([['100', '2']]);
    expect(body.asks).toEqual([['101', '1.5']]);
    await app.close();
  });

  it('GET /api/v1/orderbook/:symbol 404s for an unknown market', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/orderbook/NOPE%2FUSDT' });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('MarketNotFound');
    await app.close();
  });

  it('GET /api/v1/orderbook/:symbol 502s when the engine is unreachable', async () => {
    const app = await build(
      deps({
        depth: async () => {
          throw new MatchingUnavailableError('svc-matching down');
        },
      }),
    );
    const res = await app.inject({ method: 'GET', url: '/api/v1/orderbook/BTC%2FUSDT' });
    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe('MatchingUnavailable');
    await app.close();
  });

  it('clamps depth limit to a sane max', async () => {
    let seen = 0;
    const app = await build(
      deps({
        depth: async (_id, limit) => {
          seen = limit;
          return { bids: [], asks: [], sequence: 1 };
        },
      }),
    );
    await app.inject({ method: 'GET', url: '/api/v1/orderbook/BTC%2FUSDT?limit=99999' });
    expect(seen).toBe(500);
    await app.close();
  });
});
