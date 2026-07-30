import type { FastifyInstance, FastifyReply } from 'fastify';
import { TIMEFRAMES, timeframeSchema, type Timeframe } from '@intafaced/exchange-contract';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import { badRequest, badSymbol, notSupported, toCcxtError, type CcxtErrorResponse } from './ccxt-errors.js';
import type { EngineDepth } from './spot/matching-client.js';
import { MatchingUnavailableError } from './spot/matching-client.js';
import type { Candle, Market, PublicTapePrint } from './spot/types.js';

/**
 * Public CCXT-style REST slice (trade.ccxt-api — market data).
 *
 * Paths match `REST_ROUTES` in `@intafaced/exchange-contract`:
 *   GET /api/v1/markets
 *   GET /api/v1/orderbook/:symbol?limit=
 *   GET /api/v1/ticker/:symbol
 *   GET /api/v1/tickers
 *   GET /api/v1/trades/:symbol?limit=&since=
 *   GET /api/v1/ohlcv/:symbol?timeframe=&since=&limit=
 *   GET /api/v1/funding-rate/:symbol
 *
 * No auth — public market data. Amounts are decimal strings on the wire.
 * Private routes live in `private-rest.ts` (edge-signed principal).
 *
 * Every failure leaves here in the CCXT error shape (`ccxt-errors.ts`), because
 * a client branches on the error class to decide whether to retry.
 */

const DEFAULT_DEPTH = 50;
const MAX_DEPTH = 500;
const DEFAULT_TRADES = 100;
const MAX_TRADES = 500;
const DEFAULT_OHLCV_TIMEFRAME = '1m';
const DEFAULT_CANDLES = 500;
const MAX_CANDLES = 1000;
const EMPTY_DEPTH: EngineDepth = { bids: [], asks: [], sequence: 0 };

export interface PublicRestDeps {
  markets(): Promise<Market[]>;
  marketBySymbol(symbol: string): Promise<Market | null>;
  depth(marketId: string, limit: number): Promise<EngineDepth>;
  /**
   * Recent public prints for a market (no user/order ids). Empty when nothing
   * has traded — callers return honest 200 + [].
   * Optional sinceMs (unix ms) filters fills.ts >= since in SQL.
   */
  publicTape(marketId: string, limit: number, sinceMs?: number): Promise<PublicTapePrint[]>;
  /**
   * Candles aggregated from the real taker fill tape. Empty when the market has
   * never traded — an honest empty chart, not a fabricated one.
   */
  candles(marketId: string, timeframe: Timeframe, limit: number, sinceMs?: number): Promise<Candle[]>;
  /** Injectable clock for tests. */
  now?: () => number;
}

/** Send an already-mapped CCXT error. */
function sendCcxt(reply: FastifyReply, res: CcxtErrorResponse): FastifyReply {
  return reply.code(res.status).send(res.body);
}

/**
 * Map a throw to the CCXT shape, or rethrow. An unrecognised error must reach
 * Fastify's handler as a 500 rather than be relabelled into something a client
 * will confidently retry forever.
 */
function sendMapped(reply: FastifyReply, err: unknown): FastifyReply {
  const mapped = toCcxtError(err);
  if (!mapped) throw err;
  return sendCcxt(reply, mapped);
}

/** 10 bps → "0.001". Integer bps only; no float money path. */
export function bpsToRate(bps: number): string {
  if (!Number.isInteger(bps) || bps < 0) return '0';
  const whole = Math.floor(bps / 10_000);
  const frac = bps % 10_000;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(4, '0')}`.replace(/0+$/, '');
}

/**
 * Decimal places of a decimal-string amount.
 *
 * NOT used for CCXT `precision` any more — see `presentCcxtMarket`. Kept
 * because it is still the right answer for display rounding, where being one
 * place out costs a pixel rather than a rejected order.
 */
export function decimalPlaces(amount: string): number {
  const dot = amount.indexOf('.');
  if (dot < 0) return 0;
  // Strip trailing zeros so "0.010000" → 2.
  const frac = amount.slice(dot + 1).replace(/0+$/, '');
  return frac.length;
}

/**
 * Present a listing in the CCXT market shape.
 *
 * PRECISION IS REPORTED AS TICK SIZE, NOT DECIMAL PLACES.
 *
 * This surface used to publish `precision: { amount: decimalPlaces(lotSize),
 * price: decimalPlaces(tickSize) }`, which is only ever correct when the tick
 * and lot are powers of ten — and seven of our sixteen live listings are not:
 *
 *   EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CHF, USD/CAD   lot 1000
 *   NATGAS/USD                                             lot 10
 *
 * As a decimal-place count each of those collapses to `0`, so a client doing
 * the documented thing — round the amount to `precision.amount` places before
 * submitting — builds `1500` units of EUR/USD. The engine enforces the lot as a
 * *multiple*, so it rejects it, and every order that client ever builds on
 * those markets is rejected for a reason it cannot see from the market data.
 *
 * `precisionMode: 'TICK_SIZE'` with the tick and lot themselves is what our
 * engine actually enforces (`snapToTick`, and the lot check in risk.ts), so it
 * is the only report a client can build a fillable order from.
 */
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
    precisionMode: 'TICK_SIZE' as const,
    precision: {
      // Round quantity to a multiple of this, not to N decimal places.
      amount: lot,
      // Round price to a multiple of this.
      price: tick,
    },
    limits: {
      amount: {
        min: formatAmount(market.minQty),
        max: market.maxQty === null ? null : formatAmount(market.maxQty),
      },
      // The smallest non-zero price the engine can represent IS one tick — a
      // price below it rounds to zero. Max is unbounded and stays null rather
      // than guessing a ceiling a client would clamp against.
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

/**
 * CCXT OHLCV row: `[timestamp, open, high, low, close, volume]`.
 *
 * `timestamp` is the bucket's OPEN time in ms — CCXT's convention, and the one
 * every charting client assumes. Labelling a candle with its close time shifts
 * every series by one bar, which is invisible until someone backtests against
 * it. Volume is base-asset volume, matching `Ticker.baseVolume`.
 */
export function presentOhlcv(candle: Candle): [number, string, string, string, string, string] {
  return [
    candle.openTimeMs,
    formatAmount(candle.open),
    formatAmount(candle.high),
    formatAmount(candle.low),
    formatAmount(candle.close),
    formatAmount(candle.volume),
  ];
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
 * Register the public REST routes on a Fastify instance.
 * Mount alongside `/trpc` — no auth middleware.
 */
export function registerPublicRest(app: FastifyInstance, deps: PublicRestDeps): void {
  const now = deps.now ?? (() => Date.now());

  app.get('/api/v1/markets', async (_req, reply) => {
    const markets = await deps.markets();
    return reply.code(200).send(markets.map(presentCcxtMarket));
  });

  app.get<{ Params: { symbol: string }; Querystring: { limit?: string } }>('/api/v1/orderbook/:symbol', async (req, reply) => {
    // Fastify already percent-decodes params (BTC%2FUSDT → BTC/USDT).
    const symbol = decodeURIComponent(req.params.symbol);
    const market = await deps.marketBySymbol(symbol);
    if (!market) return sendCcxt(reply, badSymbol(symbol));

    const limit = parseLimit(req.query.limit, DEFAULT_DEPTH, MAX_DEPTH);
    try {
      const depth = await deps.depth(market.id, limit);
      return reply.code(200).send(presentOrderBook(market.symbol, depth, now()));
    } catch (err) {
      // MatchingUnavailableError → ExchangeNotAvailable/502: retryable, and the
      // client must know the difference between "down" and "no book".
      return sendMapped(reply, err);
    }
  });

  app.get<{ Params: { symbol: string } }>('/api/v1/ticker/:symbol', async (req, reply) => {
    const symbol = decodeURIComponent(req.params.symbol);
    const market = await deps.marketBySymbol(symbol);
    if (!market) return sendCcxt(reply, badSymbol(symbol));

    try {
      // Top of book only — ticker is BBO + last, not full depth.
      const [depth, tape] = await Promise.all([deps.depth(market.id, 1), deps.publicTape(market.id, 1)]);
      return reply.code(200).send(presentTicker(market.symbol, depth, tape[0] ?? null, now()));
    } catch (err) {
      // MatchingUnavailableError → ExchangeNotAvailable/502: retryable, and the
      // client must know the difference between "down" and "no book".
      return sendMapped(reply, err);
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

  app.get<{ Params: { symbol: string }; Querystring: { limit?: string; since?: string } }>('/api/v1/trades/:symbol', async (req, reply) => {
    const symbol = decodeURIComponent(req.params.symbol);
    const market = await deps.marketBySymbol(symbol);
    if (!market) return sendCcxt(reply, badSymbol(symbol));

    const limit = parseLimit(req.query.limit, DEFAULT_TRADES, MAX_TRADES);
    const sinceParsed = parseSince(req.query.since);
    if (!sinceParsed.ok) return sendCcxt(reply, badRequest(sinceParsed.message, 'trade.invalid_since'));
    // since → SQL on fills.ts (timestamptz) via publicTape.sinceMs.
    const tape = await deps.publicTape(market.id, limit, sinceParsed.sinceMs);
    return reply.code(200).send(tape.map((print) => presentPublicTrade(market.symbol, print)));
  });

  /**
   * GET /api/v1/ohlcv/:symbol — REST_ROUTES.fetchOHLCV.
   *
   * Candles are AGGREGATED FROM THE REAL TAKER FILL TAPE, in SQL, over
   * `trade.fills` — the same rows `/api/v1/trades/:symbol` publishes. Every
   * open/high/low/close is a price something actually traded at, and volume is
   * the summed quantity of those fills. Nothing here is modelled, interpolated,
   * or carried forward from a previous bucket.
   *
   * This route previously returned `[]` unconditionally. That is a worse
   * failure than it looks: a charting client cannot tell "this market has never
   * traded" from "this venue does not implement candles", so it renders an
   * empty chart for a market with a live tape and the integrator concludes the
   * data is broken.
   *
   * A bucket with no fills is ABSENT, not zero-filled. CCXT consumers treat a
   * gap as a gap; a zero-volume candle at price 0 would be a fabricated print,
   * and a client computing an indicator over it gets a number we invented.
   *
   * Query: timeframe (default 1m), since (ms), limit (default 500, max 1000).
   */
  app.get<{
    Params: { symbol: string };
    Querystring: { timeframe?: string; since?: string; limit?: string };
  }>('/api/v1/ohlcv/:symbol', async (req, reply) => {
    const symbol = decodeURIComponent(req.params.symbol);
    const market = await deps.marketBySymbol(symbol);
    if (!market) return sendCcxt(reply, badSymbol(symbol));

    const rawTf = req.query.timeframe ?? DEFAULT_OHLCV_TIMEFRAME;
    const tf = timeframeSchema.safeParse(rawTf);
    if (!tf.success) {
      return sendCcxt(reply, badRequest(`timeframe must be one of: ${TIMEFRAMES.join(', ')}`, 'trade.invalid_timeframe'));
    }

    const sinceParsed = parseSince(req.query.since);
    if (!sinceParsed.ok) return sendCcxt(reply, badRequest(sinceParsed.message, 'trade.invalid_since'));
    const limit = parseLimit(req.query.limit, DEFAULT_CANDLES, MAX_CANDLES);

    try {
      const candles = await deps.candles(market.id, tf.data, limit, sinceParsed.sinceMs);
      return reply.code(200).send(candles.map(presentOhlcv));
    } catch (err) {
      return sendMapped(reply, err);
    }
  });

  /**
   * GET /api/v1/funding-rate/:symbol — REST_ROUTES.fetchFundingRate.
   *
   * Declared in the contract and, until now, not mounted at all: a CCXT client
   * calling it got Fastify's generic 404, which reads as "wrong URL" and sends
   * an integrator looking for a path typo that does not exist.
   *
   * A funding rate is a perpetual-swap mechanism. This venue lists spot only,
   * so there is no funding rate to report and there never will be for a spot
   * market. The honest answer is `NotSupported` — stop calling — and NOT a
   * fabricated `fundingRate: "0"`, which a client would treat as a real number
   * and carry into a basis calculation.
   *
   * When trade.futures lands, swap markets answer here with a real rate and
   * spot markets keep this refusal.
   */
  app.get<{ Params: { symbol: string } }>('/api/v1/funding-rate/:symbol', async (req, reply) => {
    const symbol = decodeURIComponent(req.params.symbol);
    const market = await deps.marketBySymbol(symbol);
    if (!market) return sendCcxt(reply, badSymbol(symbol));

    // Guard on the listing kind, not on "we have no futures yet", so this arm
    // keeps telling the truth once swap markets exist.
    if (market.kind === 'spot') {
      return sendCcxt(reply, notSupported(`${market.symbol} is a spot market and has no funding rate`, 'trade.funding_rate_spot_market'));
    }

    return sendCcxt(reply, notSupported(`funding rates are not served yet for ${market.symbol}`, 'trade.funding_rate_unavailable'));
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
