import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { marketSchema, orderBookSchema, tickerSchema, tradeSchema } from '@intafaced/exchange-contract';
import { parseAmount } from '@intafaced/ledger-client';
import {
  bpsToRate,
  decimalPlaces,
  fakeMarket,
  fakePrint,
  presentCcxtMarket,
  presentOrderBook,
  presentPublicTrade,
  presentTicker,
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

  it('presents a ticker with BBO + last as decimal strings', () => {
    const wire = presentTicker(
      'BTC/USDT',
      {
        bids: [['100', '2']],
        asks: [['101', '1.5']],
        sequence: 7,
      },
      fakePrint({ price: parseAmount('100.25'), qty: parseAmount('0.5'), quoteAmount: parseAmount('50.125') }),
      1_700_000_000_000,
    );
    expect(tickerSchema.safeParse(wire).success).toBe(true);
    expect(wire.bid).toBe('100');
    expect(wire.bidVolume).toBe('2');
    expect(wire.ask).toBe('101');
    expect(wire.askVolume).toBe('1.5');
    expect(wire.last).toBe('100.25');
    expect(wire.close).toBe('100.25');
    expect(typeof wire.bid).toBe('string');
    expect(typeof wire.last).toBe('string');
    // 24h rollups intentionally null — no windowed aggregation yet.
    expect(wire.high).toBeNull();
    expect(wire.baseVolume).toBeNull();
  });

  it('presents a ticker with null last when the tape is empty', () => {
    const wire = presentTicker('BTC/USDT', { bids: [], asks: [], sequence: 0 }, null, 1_700_000_000_000);
    expect(tickerSchema.safeParse(wire).success).toBe(true);
    expect(wire.bid).toBeNull();
    expect(wire.ask).toBeNull();
    expect(wire.last).toBeNull();
  });

  it('presents a public trade without user/order/fee leakage', () => {
    const wire = presentPublicTrade(
      'BTC/USDT',
      fakePrint({
        id: 'fill-taker-1',
        side: 'sell',
        price: parseAmount('99.5'),
        qty: parseAmount('0.25'),
        quoteAmount: parseAmount('24.875'),
      }),
    );
    expect(tradeSchema.safeParse(wire).success).toBe(true);
    expect(wire.id).toBe('fill-taker-1');
    expect(wire.order).toBeNull();
    expect(wire.fee).toBeNull();
    expect(wire.takerOrMaker).toBeNull();
    expect(wire.side).toBe('sell');
    expect(wire.price).toBe('99.5');
    expect(wire.amount).toBe('0.25');
    expect(wire.cost).toBe('24.875');
    expect(typeof wire.price).toBe('string');
    // No private fields on the wire object.
    expect('userId' in wire).toBe(false);
    expect('user_id' in wire).toBe(false);
  });
});

describe('public REST routes', () => {
  const market = fakeMarket({ id: 'm-btc', symbol: 'BTC/USDT' });
  const print = fakePrint({ id: 'tape-1', price: parseAmount('100.5'), qty: parseAmount('1'), quoteAmount: parseAmount('100.5') });

  function deps(overrides: Partial<PublicRestDeps> = {}): PublicRestDeps {
    return {
      markets: async () => [market],
      marketBySymbol: async (symbol) => (symbol === 'BTC/USDT' ? market : null),
      depth: async () => ({
        bids: [['100', '2']],
        asks: [['101', '1.5']],
        sequence: 7,
      }),
      publicTape: async () => [print],
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

  it('GET /api/v1/ticker/:symbol returns BBO + last with no auth', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/ticker/BTC%2FUSDT' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(tickerSchema.safeParse(body).success).toBe(true);
    expect(body.symbol).toBe('BTC/USDT');
    expect(body.bid).toBe('100');
    expect(body.ask).toBe('101');
    expect(body.last).toBe('100.5');
    expect(typeof body.bid).toBe('string');
    expect(typeof body.last).toBe('string');
    await app.close();
  });

  it('GET /api/v1/ticker/:symbol 404s for an unknown market', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/ticker/NOPE%2FUSDT' });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('MarketNotFound');
    await app.close();
  });

  it('GET /api/v1/ticker/:symbol 502s when the engine is unreachable', async () => {
    const app = await build(
      deps({
        depth: async () => {
          throw new MatchingUnavailableError('svc-matching down');
        },
      }),
    );
    const res = await app.inject({ method: 'GET', url: '/api/v1/ticker/BTC%2FUSDT' });
    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe('MatchingUnavailable');
    await app.close();
  });

  it('GET /api/v1/trades/:symbol returns public tape without user ids', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/trades/BTC%2FUSDT?limit=10' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as unknown[];
    expect(body).toHaveLength(1);
    expect(tradeSchema.safeParse(body[0]).success).toBe(true);
    const trade = body[0] as { order: null; fee: null; price: string };
    expect(trade.order).toBeNull();
    expect(trade.fee).toBeNull();
    expect(trade.price).toBe('100.5');
    expect(JSON.stringify(body)).not.toMatch(/user/i);
    await app.close();
  });

  it('GET /api/v1/trades/:symbol returns empty array when no prints exist', async () => {
    const app = await build(deps({ publicTape: async () => [] }));
    const res = await app.inject({ method: 'GET', url: '/api/v1/trades/BTC%2FUSDT' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it('GET /api/v1/trades/:symbol 404s for an unknown market', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/trades/NOPE%2FUSDT' });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('MarketNotFound');
    await app.close();
  });

  it('clamps trades limit to a sane max', async () => {
    let seen = 0;
    const app = await build(
      deps({
        publicTape: async (_id, limit) => {
          seen = limit;
          return [];
        },
      }),
    );
    await app.inject({ method: 'GET', url: '/api/v1/trades/BTC%2FUSDT?limit=99999' });
    expect(seen).toBe(500);
    await app.close();
  });

  it('GET /api/v1/trades/:symbol?since=: passes sinceMs into publicTape', async () => {
    let seenLimit = 0;
    let seenSince: number | undefined = -1;
    const app = await build(
      deps({
        publicTape: async (_id, limit, sinceMs) => {
          seenLimit = limit;
          seenSince = sinceMs;
          return [];
        },
      }),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/trades/BTC%2FUSDT?since=1700000000000&limit=50',
    });
    expect(res.statusCode).toBe(200);
    expect(seenLimit).toBe(50);
    expect(seenSince).toBe(1_700_000_000_000);
    await app.close();
  });

  it('GET /api/v1/trades/:symbol?since=: invalid (NaN / negative) → 400 without publicTape', async () => {
    let called = false;
    const app = await build(
      deps({
        publicTape: async () => {
          called = true;
          return [];
        },
      }),
    );
    for (const since of ['nope', '-1']) {
      called = false;
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/trades/BTC%2FUSDT?since=${encodeURIComponent(since)}`,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('InvalidSince');
      expect(called).toBe(false);
    }
    await app.close();
  });

  it('GET /api/v1/tickers returns a record of tickers keyed by symbol', async () => {
    const eth = fakeMarket({ id: 'm-eth', symbol: 'ETH/USDT', baseAsset: 'ETH' });
    const app = await build(
      deps({
        markets: async () => [market, eth],
        marketBySymbol: async (symbol) => (symbol === 'BTC/USDT' ? market : symbol === 'ETH/USDT' ? eth : null),
      }),
    );
    const res = await app.inject({ method: 'GET', url: '/api/v1/tickers' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['BTC/USDT', 'ETH/USDT']);
    expect(tickerSchema.safeParse(body['BTC/USDT']).success).toBe(true);
    expect(tickerSchema.safeParse(body['ETH/USDT']).success).toBe(true);
    expect((body['BTC/USDT'] as { bid: string }).bid).toBe('100');
    expect(typeof (body['BTC/USDT'] as { last: string }).last).toBe('string');
    await app.close();
  });

  it('GET /api/v1/tickers returns empty object when no markets listed', async () => {
    const app = await build(deps({ markets: async () => [] }));
    const res = await app.inject({ method: 'GET', url: '/api/v1/tickers' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({});
    await app.close();
  });

  it('GET /api/v1/tickers still returns a market when the book is unavailable', async () => {
    const app = await build(
      deps({
        depth: async () => {
          throw new MatchingUnavailableError('svc-matching down');
        },
      }),
    );
    const res = await app.inject({ method: 'GET', url: '/api/v1/tickers' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, { bid: null; last: string }>;
    expect(tickerSchema.safeParse(body['BTC/USDT']).success).toBe(true);
    expect(body['BTC/USDT']!.bid).toBeNull();
    // Tape still available — last print is honest.
    expect(body['BTC/USDT']!.last).toBe('100.5');
    await app.close();
  });

  // No candle aggregation store yet — honest empty until a candle job lands.
  it('GET /api/v1/ohlcv/:symbol returns empty array with no auth', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/ohlcv/BTC%2FUSDT' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it('GET /api/v1/ohlcv/:symbol accepts valid timeframe and still returns empty', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ohlcv/BTC%2FUSDT?timeframe=1h&since=1700000000000&limit=100',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it('GET /api/v1/ohlcv/:symbol 404s for an unknown market', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/ohlcv/NOPE%2FUSDT' });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('MarketNotFound');
    await app.close();
  });

  it('GET /api/v1/ohlcv/:symbol 400s for a bad timeframe', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/ohlcv/BTC%2FUSDT?timeframe=7m' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('InvalidTimeframe');
    await app.close();
  });
});
