import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { exchangeErrorSchema, marketSchema, ohlcvSchema, orderBookSchema, tickerSchema, tradeSchema } from '@intafaced/exchange-contract';
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
    // Precision is the tick and the lot themselves, not a count of places.
    expect(wire.precisionMode).toBe('TICK_SIZE');
    expect(wire.precision.price).toBe('0.01');
    expect(wire.precision.amount).toBe('0.0001');
    expect(wire.limits.amount.min).toBe('0.0001');
    // Money fields are decimal strings, never numbers.
    expect(typeof wire.maker).toBe('string');
    expect(typeof wire.limits.cost.min).toBe('string');
  });

  /**
   * The regression this shape exists to stop. Seven of the sixteen live
   * listings have a lot size that is not a power of ten — the six forex majors
   * at 1000 units and NATGAS/USD at 10 — and the previous decimal-places
   * report collapsed every one of them to `0`. A client rounding an amount to
   * 0 decimal places builds 1500 units of EUR/USD, which the engine must
   * reject because it enforces the lot as a multiple.
   */
  it('reports a lot size larger than one exactly, not as zero decimal places', () => {
    const eurusd = presentCcxtMarket(
      fakeMarket({
        symbol: 'EUR/USD',
        baseAsset: 'EUR',
        quoteAsset: 'USD',
        tickSize: parseAmount('0.00001'),
        lotSize: parseAmount('1000'),
        minQty: parseAmount('1000'),
      }),
    );
    expect(marketSchema.safeParse(eurusd).success).toBe(true);
    expect(eurusd.precision.amount).toBe('1000');
    expect(eurusd.precision.price).toBe('0.00001');
    // The old report was the number 0, which reads as "whole units are fine".
    expect(eurusd.precision.amount).not.toBe(0);

    const natgas = presentCcxtMarket(
      fakeMarket({ symbol: 'NATGAS/USD', tickSize: parseAmount('0.001'), lotSize: parseAmount('10'), minQty: parseAmount('10') }),
    );
    expect(natgas.precision.amount).toBe('10');

    // A quantity built from the reported precision is a multiple of the lot —
    // the property a client actually depends on to get an order accepted.
    for (const wire of [eurusd, natgas]) {
      const lot = parseAmount(wire.precision.amount);
      expect(parseAmount(wire.limits.amount.min!) % lot).toBe(0n);
    }
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
      candles: async () => [],
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
    expect(res.json().code).toBe('BadSymbol');
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
    expect(res.json().code).toBe('ExchangeNotAvailable');
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
    expect(res.json().code).toBe('BadSymbol');
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
    expect(res.json().code).toBe('ExchangeNotAvailable');
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
    expect(res.json().code).toBe('BadSymbol');
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
      expect(res.json().code).toBe('BadRequest');
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

  // ── OHLCV ────────────────────────────────────────────────────────────────

  const candle = {
    openTimeMs: 1_700_000_000_000,
    open: parseAmount('100'),
    high: parseAmount('105.5'),
    low: parseAmount('99'),
    close: parseAmount('101.25'),
    volume: parseAmount('12.5'),
  };

  it('GET /api/v1/ohlcv/:symbol serves real candles as CCXT tuples with no auth', async () => {
    const app = await build(deps({ candles: async () => [candle] }));
    const res = await app.inject({ method: 'GET', url: '/api/v1/ohlcv/BTC%2FUSDT' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as unknown[];
    expect(body).toHaveLength(1);
    // [timestamp, open, high, low, close, volume] — the contract's own shape.
    expect(ohlcvSchema.safeParse(body[0]).success).toBe(true);
    expect(body[0]).toEqual([1_700_000_000_000, '100', '105.5', '99', '101.25', '12.5']);
    // Every price is a decimal string. A float here would lose the ledger's 18
    // places on the way to a chart that people trade from.
    for (const field of (body[0] as unknown[]).slice(1)) expect(typeof field).toBe('string');
    await app.close();
  });

  it('GET /api/v1/ohlcv/:symbol passes timeframe, since and limit through to the aggregator', async () => {
    let seen: { tf: string; limit: number; since?: number } | null = null;
    const app = await build(
      deps({
        candles: async (_id, timeframe, limit, sinceMs) => {
          seen = { tf: timeframe, limit, since: sinceMs };
          return [];
        },
      }),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ohlcv/BTC%2FUSDT?timeframe=1h&since=1700000000000&limit=100',
    });
    expect(res.statusCode).toBe(200);
    expect(seen).toEqual({ tf: '1h', limit: 100, since: 1_700_000_000_000 });
    await app.close();
  });

  it('GET /api/v1/ohlcv/:symbol clamps limit and defaults the timeframe', async () => {
    let seen: { tf: string; limit: number } | null = null;
    const app = await build(
      deps({
        candles: async (_id, timeframe, limit) => {
          seen = { tf: timeframe, limit };
          return [];
        },
      }),
    );
    await app.inject({ method: 'GET', url: '/api/v1/ohlcv/BTC%2FUSDT?limit=99999' });
    expect(seen).toEqual({ tf: '1m', limit: 1000 });
    await app.close();
  });

  /**
   * A market that has never traded has no candles. That is an honest empty
   * chart — and critically NOT a zero-filled series, which would put a price of
   * 0 on a chart somebody trades from.
   */
  it('GET /api/v1/ohlcv/:symbol returns empty for a market that has never traded', async () => {
    const app = await build(deps({ candles: async () => [] }));
    const res = await app.inject({ method: 'GET', url: '/api/v1/ohlcv/BTC%2FUSDT' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it('GET /api/v1/ohlcv/:symbol 404s BadSymbol for an unknown market', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/ohlcv/NOPE%2FUSDT' });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('BadSymbol');
    await app.close();
  });

  it('GET /api/v1/ohlcv/:symbol 400s BadRequest for a bad timeframe, without aggregating', async () => {
    let called = false;
    const app = await build(
      deps({
        candles: async () => {
          called = true;
          return [];
        },
      }),
    );
    const res = await app.inject({ method: 'GET', url: '/api/v1/ohlcv/BTC%2FUSDT?timeframe=7m' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('BadRequest');
    expect(res.json().intafacedCode).toBe('trade.invalid_timeframe');
    expect(called).toBe(false);
    await app.close();
  });

  it('GET /api/v1/ohlcv/:symbol 400s for an invalid since, without aggregating', async () => {
    let called = false;
    const app = await build(
      deps({
        candles: async () => {
          called = true;
          return [];
        },
      }),
    );
    for (const since of ['nope', '-1']) {
      called = false;
      const res = await app.inject({ method: 'GET', url: `/api/v1/ohlcv/BTC%2FUSDT?since=${since}` });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('BadRequest');
      expect(called).toBe(false);
    }
    await app.close();
  });

  // ── Funding rate ─────────────────────────────────────────────────────────

  /**
   * Declared in REST_ROUTES and previously not mounted at all, so it answered
   * Fastify's generic 404 — indistinguishable from a bad URL or a broken
   * deploy. It is now a typed refusal, and above all NOT a fabricated "0".
   */
  it('GET /api/v1/funding-rate/:symbol refuses a spot market with NotSupported, not a made-up rate', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/funding-rate/BTC%2FUSDT' });
    expect(res.statusCode).toBe(501);
    const body = res.json();
    expect(body.code).toBe('NotSupported');
    expect(body.intafacedCode).toBe('trade.funding_rate_spot_market');
    // The refusal must not carry a number a client could mistake for a rate.
    expect(body.fundingRate).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/fundingRate/);
    await app.close();
  });

  it('GET /api/v1/funding-rate/:symbol 404s BadSymbol for an unknown market', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/funding-rate/NOPE%2FUSDT' });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('BadSymbol');
    await app.close();
  });

  /**
   * The whole point of the taxonomy: every failure on this surface validates
   * against `exchangeErrorSchema`, so a CCXT client can branch on the class
   * instead of pattern-matching our internal strings.
   */
  it('answers every public failure in the CCXT error shape', async () => {
    const app = await build(
      deps({
        depth: async () => {
          throw new MatchingUnavailableError('svc-matching down');
        },
      }),
    );
    for (const url of [
      '/api/v1/ticker/NOPE%2FUSDT',
      '/api/v1/orderbook/NOPE%2FUSDT',
      '/api/v1/trades/NOPE%2FUSDT',
      '/api/v1/ohlcv/NOPE%2FUSDT',
      '/api/v1/funding-rate/NOPE%2FUSDT',
      '/api/v1/ohlcv/BTC%2FUSDT?timeframe=7m',
      '/api/v1/trades/BTC%2FUSDT?since=nope',
      '/api/v1/orderbook/BTC%2FUSDT',
      '/api/v1/ticker/BTC%2FUSDT',
      '/api/v1/funding-rate/BTC%2FUSDT',
    ]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBeGreaterThanOrEqual(400);
      const parsed = exchangeErrorSchema.safeParse(res.json());
      expect(parsed.success, `${url} → ${res.body}`).toBe(true);
    }
    await app.close();
  });
});
