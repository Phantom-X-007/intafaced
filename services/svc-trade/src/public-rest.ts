import type { FastifyInstance } from 'fastify';
import { TIMEFRAMES, timeframeSchema } from '@intafaced/exchange-contract';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import type { EngineDepth } from './spot/matching-client.js';
import { MatchingUnavailableError } from './spot/matching-client.js';
import type { Market, PublicTapePrint } from './spot/types.js';

/**
 * Public CCXT-style REST slice (trade.ccxt-api — market data).
 *
 * Paths match `REST_ROUTES` in `@intafaced/exchange-contract`:
 *   GET /api/v1/markets
 *   GET /api/v1/orderbook/:symbol?limit=
 *   GET /api/v1/ticker/:symbol
 *   GET /api/v1/tickers
 *   GET /api/v1/trades/:symbol?limit=
 *   GET /api/v1/ohlcv/:symbol?timeframe=&since=&limit=
 *
 * No auth — public market data. Amounts are decimal strings on the wire.
 * Private routes live in `private-rest.ts` (edge-signed principal).
 */

const DEFAULT_DEPTH = 50;
const MAX_DEPTH = 500;
const DEFAULT_TRADES = 100;
const MAX_TRADES = 500;
const DEFAULT_OHLCV_TIMEFRAME = '1m';
const EMPTY_DEPTH: EngineDepth = { bids: [], asks: [], sequence: 0 };

export interface PublicRestDeps {
  markets(): Promise<Market[]>;
  marketBySymbol(symbol: string): Promise<Market | null>;
  depth(marketId: string, limit: number): Promise<EngineDepth>;
  /**
   * Recent public prints for a market (no user/order ids). Empty when nothing
   * has traded — callers return honest 200 + [].
   */
  publicTape(marketId: string, limit: number): Promise<PublicTapePrint[]>;
  /** Injectable clock for tests. */
  now?: () => number;
}

/** 10 bps → "0.001". Integer bps only; no float money path. */
export function bpsToRate(bps: number): string {
  if (!Number.isInteger(bps) || bps < 0) return '0';
  const whole = Math.floor(bps / 10_000);
  const frac = bps % 10_000;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(4, '0')}`.replace(/0+$/, '');
}

/** Decimal places of a decimal-string amount (for CCXT precision fields). */
export function decimalPlaces(amount: string): number {
  const dot = amount.indexOf('.');
  if (dot < 0) return 0;
  // Strip trailing zeros so "0.010000" → 2.
  const frac = amount.slice(dot + 1).replace(/0+$/, '');
  return frac.length;
}

export function presentCcxtMarket(market: Market) {
  const tick = formatAmount(market.tickSize);
  const lot = formatAmount(market.lotSize);
  const isSpot = market.kind === 'spot';
  const type = market.kind === 'futures' ? ('swap' as const) : market.kind === 'options' ? ('option' as const) : ('spot' as const);

  return {
    id: market.id,
    symbol: market.symbol,
    base: market.baseAsset,
    quote: market.quoteAsset,
    settle: null as string | null,
    baseId: market.baseAsset,
    quoteId: market.quoteAsset,
    type,
    spot: isSpot,
    swap: market.kind === 'futures',
    future: false,
    option: market.kind === 'options',
    contract: !isSpot,
    linear: isSpot ? null : true,
    inverse: isSpot ? null : false,
    active: market.status === 'active',
    taker: bpsToRate(market.takerBps),
    maker: bpsToRate(market.makerBps),
    contractSize: null as string | null,
    expiry: null as number | null,
    expiryDatetime: null as string | null,
    strike: null as string | null,
    optionType: null as 'call' | 'put' | null,
    precision: {
      amount: decimalPlaces(lot),
      price: decimalPlaces(tick),
    },
    limits: {
      amount: {
        min: formatAmount(market.minQty),
        max: market.maxQty === null ? null : formatAmount(market.maxQty),
      },
      price: { min: tick, max: null as string | null },
      cost: { min: formatAmount(market.minNotional), max: null as string | null },
      leverage: { min: null as string | null, max: null as string | null },
    },
  };
}

export function presentOrderBook(symbol: string, depth: EngineDepth, nowMs: number) {
  return {
    symbol,
    bids: depth.bids.map(([p, q]) => [p, q] as [string, string]),
    asks: depth.asks.map(([p, q]) => [p, q] as [string, string]),
    timestamp: nowMs,
    datetime: new Date(nowMs).toISOString(),
    nonce: depth.sequence,
  };
}

/**
 * Best bid/ask from the book + last print if any.
 *
 * 24h rollups (high/low/vwap/volume) are null until a windowed aggregation job
 * exists — bots still get a usable top-of-book ticker without inventing stats.
 */
export function presentTicker(symbol: string, depth: EngineDepth, last: PublicTapePrint | null, nowMs: number) {
  const bestBid = depth.bids[0] ?? null;
  const bestAsk = depth.asks[0] ?? null;
  const lastPrice = last ? formatAmount(last.price) : null;

  return {
    symbol,
    timestamp: nowMs,
    datetime: new Date(nowMs).toISOString(),
    high: null as string | null,
    low: null as string | null,
    bid: bestBid ? bestBid[0] : null,
    bidVolume: bestBid ? bestBid[1] : null,
    ask: bestAsk ? bestAsk[0] : null,
    askVolume: bestAsk ? bestAsk[1] : null,
    vwap: null as string | null,
    open: null as string | null,
    close: lastPrice,
    last: lastPrice,
    previousClose: null as string | null,
    change: null as string | null,
    percentage: null as string | null,
    average: null as string | null,
    baseVolume: null as string | null,
    quoteVolume: null as string | null,
  };
}

/**
 * Public tape print — no order id, no fee, no user identity.
 * `side` is the taker's side (the aggressor), CCXT public-trade convention.
 */
export function presentPublicTrade(symbol: string, print: PublicTapePrint) {
  const ts = print.ts.getTime();
  return {
    id: print.id,
    order: null as string | null,
    timestamp: ts,
    datetime: new Date(ts).toISOString(),
    symbol,
    type: null as string | null,
    side: print.side,
    takerOrMaker: null as 'taker' | 'maker' | null,
    price: formatAmount(print.price),
    amount: formatAmount(print.qty),
    cost: formatAmount(print.quoteAmount),
    fee: null as { cost: string; currency: string; rate: string | null } | null,
  };
}

function parseLimit(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/**
 * Register the public REST routes on a Fastify instance.
 * Mount alongside `/trpc` — no auth middleware.
 */
export function registerPublicRest(app: FastifyInstance, deps: PublicRestDeps): void {
  const now = deps.now ?? (() => Date.now());

  app.get('/api/v1/markets', async (_req, reply) => {
    const markets = await deps.markets();
    return reply.code(200).send(markets.map(presentCcxtMarket));
  });

  app.get<{ Params: { symbol: string }; Querystring: { limit?: string } }>(
    '/api/v1/orderbook/:symbol',
    async (req, reply) => {
      // Fastify already percent-decodes params (BTC%2FUSDT → BTC/USDT).
      const symbol = decodeURIComponent(req.params.symbol);
      const market = await deps.marketBySymbol(symbol);
      if (!market) {
        return reply.code(404).send({ code: 'MarketNotFound', message: `market ${symbol} not found` });
      }

      const limit = parseLimit(req.query.limit, DEFAULT_DEPTH, MAX_DEPTH);
      try {
        const depth = await deps.depth(market.id, limit);
        return reply.code(200).send(presentOrderBook(market.symbol, depth, now()));
      } catch (err) {
        if (err instanceof MatchingUnavailableError) {
          return reply.code(502).send({ code: 'MatchingUnavailable', message: err.message });
        }
        throw err;
      }
    },
  );

  app.get<{ Params: { symbol: string } }>('/api/v1/ticker/:symbol', async (req, reply) => {
    const symbol = decodeURIComponent(req.params.symbol);
    const market = await deps.marketBySymbol(symbol);
    if (!market) {
      return reply.code(404).send({ code: 'MarketNotFound', message: `market ${symbol} not found` });
    }

    try {
      // Top of book only — ticker is BBO + last, not full depth.
      const [depth, tape] = await Promise.all([deps.depth(market.id, 1), deps.publicTape(market.id, 1)]);
      return reply.code(200).send(presentTicker(market.symbol, depth, tape[0] ?? null, now()));
    } catch (err) {
      if (err instanceof MatchingUnavailableError) {
        return reply.code(502).send({ code: 'MatchingUnavailable', message: err.message });
      }
      throw err;
    }
  });

  /**
   * All-market tickers. Record keyed by unified symbol (CCXT `fetchTickers`).
   *
   * Markets with no book (or a matching hop that is down for that market) still
   * appear — empty BBO + last from the tape if any. Never invent 24h stats.
   */
  app.get('/api/v1/tickers', async (_req, reply) => {
    const markets = await deps.markets();
    const ts = now();
    const out: Record<string, ReturnType<typeof presentTicker>> = {};

    await Promise.all(
      markets.map(async (market) => {
        let depth: EngineDepth = EMPTY_DEPTH;
        try {
          depth = await deps.depth(market.id, 1);
        } catch (err) {
          // Bulk path: a missing book must not 502 the whole venue map.
          if (!(err instanceof MatchingUnavailableError)) throw err;
        }
        const tape = await deps.publicTape(market.id, 1);
        out[market.symbol] = presentTicker(market.symbol, depth, tape[0] ?? null, ts);
      }),
    );

    return reply.code(200).send(out);
  });

  app.get<{ Params: { symbol: string }; Querystring: { limit?: string } }>(
    '/api/v1/trades/:symbol',
    async (req, reply) => {
      const symbol = decodeURIComponent(req.params.symbol);
      const market = await deps.marketBySymbol(symbol);
      if (!market) {
        return reply.code(404).send({ code: 'MarketNotFound', message: `market ${symbol} not found` });
      }

      const limit = parseLimit(req.query.limit, DEFAULT_TRADES, MAX_TRADES);
      const tape = await deps.publicTape(market.id, limit);
      return reply.code(200).send(tape.map((print) => presentPublicTrade(market.symbol, print)));
    },
  );

  /**
   * GET /api/v1/ohlcv/:symbol — REST_ROUTES.fetchOHLCV.
   *
   * No candle aggregation store exists anywhere in the monorepo yet. This route
   * is wired so bots get a real path (not 404), validates params honestly, and
   * always returns [] until a candle aggregation job lands. Do not invent
   * OHLCV from fake data or incomplete tape bucketing here.
   *
   * Query: timeframe (optional, default 1m), since (ms, accepted for contract
   * shape), limit (accepted for contract shape). Bad timeframe → 400.
   */
  app.get<{
    Params: { symbol: string };
    Querystring: { timeframe?: string; since?: string; limit?: string };
  }>('/api/v1/ohlcv/:symbol', async (req, reply) => {
    const symbol = decodeURIComponent(req.params.symbol);
    const market = await deps.marketBySymbol(symbol);
    if (!market) {
      return reply.code(404).send({ code: 'MarketNotFound', message: `market ${symbol} not found` });
    }

    const rawTf = req.query.timeframe ?? DEFAULT_OHLCV_TIMEFRAME;
    const tf = timeframeSchema.safeParse(rawTf);
    if (!tf.success) {
      return reply.code(400).send({
        code: 'InvalidTimeframe',
        message: `timeframe must be one of: ${TIMEFRAMES.join(', ')}`,
      });
    }

    // since / limit are accepted so clients matching the contract do not 400,
    // but there is no candle source yet — empty until aggregation job.
    void tf.data;
    void req.query.since;
    void req.query.limit;

    return reply.code(200).send([]);
  });
}

/** Test helper — build a minimal Market without a DB. */
export function fakeMarket(partial: {
  id?: string;
  symbol?: string;
  baseAsset?: string;
  quoteAsset?: string;
  kind?: Market['kind'];
  status?: Market['status'];
  tickSize?: Amount;
  lotSize?: Amount;
  minQty?: Amount;
  maxQty?: Amount | null;
  minNotional?: Amount;
  makerBps?: number;
  takerBps?: number;
}): Market {
  return {
    id: partial.id ?? '00000000-0000-4000-8000-000000000001',
    symbol: partial.symbol ?? 'BTC/USDT',
    baseAsset: partial.baseAsset ?? 'BTC',
    quoteAsset: partial.quoteAsset ?? 'USDT',
    kind: partial.kind ?? 'spot',
    tickSize: partial.tickSize ?? parseAmount('0.01'),
    lotSize: partial.lotSize ?? parseAmount('0.0001'),
    minQty: partial.minQty ?? parseAmount('0.0001'),
    maxQty: partial.maxQty === undefined ? null : partial.maxQty,
    minNotional: partial.minNotional ?? parseAmount('1'),
    status: partial.status ?? 'active',
    makerBps: partial.makerBps ?? 10,
    takerBps: partial.takerBps ?? 20,
    listedAt: null,
    assetClass: 'crypto',
    schedule: 'crypto-24x7',
  };
}

/** Test helper — one public print. */
export function fakePrint(partial: {
  id?: string;
  side?: PublicTapePrint['side'];
  price?: Amount;
  qty?: Amount;
  quoteAmount?: Amount;
  sequence?: number;
  ts?: Date;
}): PublicTapePrint {
  return {
    id: partial.id ?? '00000000-0000-4000-8000-0000000000aa',
    side: partial.side ?? 'buy',
    price: partial.price ?? parseAmount('100.5'),
    qty: partial.qty ?? parseAmount('1.2'),
    quoteAmount: partial.quoteAmount ?? parseAmount('120.6'),
    sequence: partial.sequence ?? 1,
    ts: partial.ts ?? new Date('2023-11-14T22:13:20.000Z'),
  };
}
