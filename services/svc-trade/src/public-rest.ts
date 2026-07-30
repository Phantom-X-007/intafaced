import type { FastifyInstance } from 'fastify';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import type { EngineDepth } from './spot/matching-client.js';
import { MatchingUnavailableError } from './spot/matching-client.js';
import type { Market } from './spot/types.js';

/**
 * Public CCXT-style REST slice (trade.ccxt-api — markets + orderbook only).
 *
 * Paths match `REST_ROUTES` in `@intafaced/exchange-contract`:
 *   GET /api/v1/markets
 *   GET /api/v1/orderbook/:symbol?limit=
 *
 * No auth — public market data. Amounts are decimal strings on the wire.
 * Private routes (orders, balances, …) are deliberately absent.
 */

const DEFAULT_DEPTH = 50;
const MAX_DEPTH = 500;

export interface PublicRestDeps {
  markets(): Promise<Market[]>;
  marketBySymbol(symbol: string): Promise<Market | null>;
  depth(marketId: string, limit: number): Promise<EngineDepth>;
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

function parseLimit(raw: unknown): number {
  const n = Number(raw ?? DEFAULT_DEPTH);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DEPTH;
  return Math.min(Math.floor(n), MAX_DEPTH);
}

/**
 * Register the two public REST routes on a Fastify instance.
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

      const limit = parseLimit(req.query.limit);
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
