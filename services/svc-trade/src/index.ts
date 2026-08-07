import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { TradeService } from './spot/trade-service.js';
import { createMatchingClient } from './spot/matching-client.js';
import { createRankPerksClient } from './spot/rank-perks.js';
import { createSubAccountOwnershipClient } from './spot/sub-account-ownership.js';
import { createLedgerClient } from './ledger-client.js';
import { subscribeMatchingEvents } from './events.js';
import { createTradeRouter, type TradeRouter } from './router.js';
import { registerPublicRest } from './public-rest.js';
import { registerPrivateRest } from './private-rest.js';
import { PositionService } from './futures/position-service.js';
import { optionalProfitSourceFromConfig } from './futures/profit-source.js';
import { parseFundingMarketIds, startFuturesJobs } from './futures/futures-jobs.js';
import { createConfiguredVenueMarkSource, createVenueMarketDataAdapter, parseVenueMarkSymbols } from './futures/mark-from-venue.js';
import { registerInternalFundingRate } from './futures/internal-funding-rate.js';
import { parseMmSeedTargets, startMmSeedJobs } from './mm/seed-jobs.js';
import { createMmMidSourceFromConfig } from './mm/mid-source.js';
import { parseCandleMarketIds, parseCandleTimeframes } from './spot/candles.js';
import { startCandleJobs } from './spot/candle-jobs.js';
import { checkEngineSequences, describeRegressions } from './spot/sequence-guard.js';
import { parseAmount } from '@intafaced/ledger-client';
import { registerProcessHooks, startTelemetry } from '@intafaced/telemetry';
import { parseOtcDeskLawJson } from './otc/desk-law.js';
import { OtcDeskService } from './otc/otc-service.js';
import { createOtcStakeSource } from './otc/stake-source.js';

// §9 — register the TracerProvider before the first span is created.
// `@opentelemetry/api` alone is a no-op: without this call every span in
// ./tracing.ts is built, tagged and then discarded before it reaches the
// collector. Tracers grabbed at module scope resolve lazily through the proxy
// provider, so registering here still captures them.
registerProcessHooks(
  startTelemetry({
    serviceName: env.SERVICE_NAME,
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    enabled: env.OTEL_ENABLED,
    environment: env.APP_ENV,
  }),
);

/**
 * svc-trade — the product layer over the matching engine (§5.2).
 *
 * Graph W1-R: mount tRPC; verify edge-signed principal (mount-boundary #48).
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'trade,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM trade.markets LIMIT 1`.catch(() => {
  throw new Error('trade schema is missing — run migrations before starting svc-trade');
});

// Value moves through svc-ledger, never through this service's own tables
// (Doctrine §0.6). This client is the only path.
const ledger = createLedgerClient(env.LEDGER_URL, env.INTERNAL_SERVICE_SECRET);

// The book lives in svc-matching. This service never runs one of its own —
// §5.1 draws that line and a second book would be a second truth.
const matching = createMatchingClient(env.MATCHING_URL, env.INTERNAL_SERVICE_SECRET);
const perks = createRankPerksClient(env.IDENTITY_URL, env.INTERNAL_SERVICE_SECRET);
const subAccounts = createSubAccountOwnershipClient(env.IDENTITY_URL, env.INTERNAL_SERVICE_SECRET);

const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  // Hosts `orderUpdated` (user-visible lifecycle for private streams).
  ownedStreams: ['trade'],
});

const trade = new TradeService(sql, ledger, matching, perks, bus, {
  spotEnabled: env.TRADE_SPOT_ENABLED,
  marketSlippageCapBps: env.TRADE_MARKET_SLIPPAGE_CAP_BPS,
  convertEnabled: env.TRADE_CONVERT_ENABLED,
  convertSpreadBps: env.TRADE_CONVERT_SPREAD_BPS,
  algoEnabled: env.TRADE_ALGO_ENABLED,
  subAccounts,
});

const subscriptions = await subscribeMatchingEvents(bus, trade);

// trade.otc — D-S-02 Stage. Empty TRADE_OTC_DESK_LAW → refuse-closed (no invent).
const otcDeskLaw = parseOtcDeskLawJson(env.TRADE_OTC_DESK_LAW);
const otcStakes = createOtcStakeSource(env.TOKEN_URL, env.INTERNAL_SERVICE_SECRET);
const otc = new OtcDeskService(ledger, otcStakes, { law: otcDeskLaw });

export const appRouter = createTradeRouter(trade, otc);
export type AppRouter = typeof appRouter;

const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

// Venue fabric public mid → mark path (A-TRADE-VENUE-1). Empty venue = off.
// Unknown venue id → null (refuse invent). Symbol map required per market.
// Shared adapter also feeds MM mid port when TRADE_MM_SEED_MID_FROM_VENUE (A-TRADE-MM-3).
const venuePublicAdapter = createVenueMarketDataAdapter(env.TRADE_VENUE_MARK_VENUE);
const venueMarkConfigured = createConfiguredVenueMarkSource({
  venueId: env.TRADE_VENUE_MARK_VENUE,
  symbols: env.TRADE_VENUE_MARK_SYMBOLS,
  adapter: venuePublicAdapter,
});
if (env.TRADE_VENUE_MARK_VENUE.trim() && !venueMarkConfigured) {
  // Typo / unsupported venue — say so once; do not invent a mid adapter.
  console.warn(
    `[svc-trade] TRADE_VENUE_MARK_VENUE=${env.TRADE_VENUE_MARK_VENUE.trim()} is not a known public MarketDataAdapter; venue mark off (never invent). Supported: binance-spot`,
  );
}

// Futures residual jobs — default OFF. Rate book is process-local for public REST peeks.
// Marks: venue fabric preferred when configured, else matching depth mid — never invent.
const futuresJobs = startFuturesJobs({
  sql,
  ledger,
  matching,
  bus,
  venueMarkSource: venueMarkConfigured?.source ?? null,
  config: {
    enabled: env.TRADE_FUTURES_JOBS_ENABLED,
    liqIntervalMs: env.TRADE_FUTURES_LIQ_INTERVAL_MS,
    fundingIntervalMs: env.TRADE_FUTURES_FUNDING_INTERVAL_MS,
    fundingMarketIds: parseFundingMarketIds(env.TRADE_FUTURES_FUNDING_MARKET_IDS),
  },
  onError: (name, err) => app.log.error({ err, job: name }, 'futures job tick failed'),
});

/**
 * WHERE REALISED FUTURES PROFIT COMES FROM.
 *
 * Still not defaulted, and a value that IS set is still validated right here at
 * boot: unparseable, or an account `futuresRealizeProfit` does not draw from,
 * and this process exits. Which account and how it is capitalised remains an
 * owner decision (`docs/adr/2026-08-05-futures-risk-and-mark-law.md`).
 *
 * What changed is what happens when nobody has decided YET. This line used to
 * call `profitSourceFromConfig`, which throws on an empty value — while
 * `.env.example` ships the variable commented out and compose passes
 * `${TRADE_FUTURES_PROFIT_SOURCE:-}`. So `pnpm platform:up` from a clean clone
 * crash-looped svc-trade. Not "futures": svc-trade. Spot orders, ticker,
 * orderbook, balances, fees, positions and the feeds behind the websocket all
 * went with it, over a pot that only matters when somebody closes a winning
 * perp. A refusal with exactly one legal answer is not a decision gate, it is
 * an outage.
 *
 * So the absence of a decision now disables the FEATURE: `null` here, `open()`
 * refuses, and a close that would realise profit refuses. Nothing is ever paid
 * out of an account nobody chose — which is what the ADR requires — and the
 * exchange stays up while the owner decides.
 */
const profitSource = optionalProfitSourceFromConfig(env.TRADE_FUTURES_PROFIT_SOURCE);
if (profitSource) {
  app.log.info({ profitSource: profitSource.configured }, 'futures realised profit is bounded by this account');
} else {
  app.log.warn(
    { variable: 'TRADE_FUTURES_PROFIT_SOURCE' },
    'FUTURES IS DISABLED: no account is named to fund realised profit, so opens are refused and no profit can be paid. ' +
      'Losing and flat closes of existing positions still work, and the rest of svc-trade is serving normally. See .env.example.',
  );
}

/**
 * Positions price from `futuresJobs.marks` — the same venue-fabric-then-depth
 * port liquidation reads. Constructed after the jobs for that reason: there is
 * no second price path, and no request body anywhere near one.
 */
const positions = new PositionService(sql, ledger, {
  marks: futuresJobs.marks,
  profitSource,
  bus,
});

// Spot candle materialization — default OFF. REST OHLCV still live from fills.
const candleJobs = startCandleJobs({
  sql,
  config: {
    enabled: env.TRADE_CANDLE_JOBS_ENABLED,
    intervalMs: env.TRADE_CANDLE_JOBS_INTERVAL_MS,
    marketIds: parseCandleMarketIds(env.TRADE_CANDLE_JOBS_MARKET_IDS),
    timeframes: parseCandleTimeframes(env.TRADE_CANDLE_JOBS_TIMEFRAMES),
  },
  onError: (name, err) => app.log.error({ err, job: name }, 'candle job tick failed'),
  onResult: (r) => {
    if (r.written > 0) {
      app.log.info(
        { marketId: r.marketId, timeframe: r.timeframe, candleCount: r.candleCount, written: r.written },
        'candle materialize ok',
      );
    }
  },
});

// MM seed job — default OFF. Empty markets or missing mids → no invent.
// Mid port (A-TRADE-MM-3): env map first; optional venue public mid when enabled.
const venueMarkSymbols = parseVenueMarkSymbols(env.TRADE_VENUE_MARK_SYMBOLS);
const mmMidSource = createMmMidSourceFromConfig({
  midsEnv: env.TRADE_MM_SEED_MIDS,
  midFromVenue: env.TRADE_MM_SEED_MID_FROM_VENUE,
  venueAdapter: venuePublicAdapter,
  resolveVenueSymbol: (marketId) => venueMarkSymbols.get(marketId) ?? null,
});
const mmSeedJobs = startMmSeedJobs({
  ledger,
  matching,
  midSource: mmMidSource,
  config: {
    enabled: env.TRADE_MM_SEED_ENABLED,
    intervalMs: env.TRADE_MM_SEED_INTERVAL_MS,
    halfSpreadBps: env.TRADE_MM_SEED_HALF_SPREAD_BPS,
    stepBps: env.TRADE_MM_SEED_STEP_BPS,
    levels: env.TRADE_MM_SEED_LEVELS,
    qtyPerLevel: env.TRADE_MM_SEED_QTY,
    targets: parseMmSeedTargets(env.TRADE_MM_SEED_MARKETS),
  },
  statePath: env.TRADE_MM_SEED_STATE_PATH,
  onError: (name, err) => app.log.error({ err, job: name }, 'mm seed job tick failed'),
  onResult: (marketId, result) => {
    if ('skipped' in result) {
      app.log.info({ marketId, skipped: result.skipped }, 'mm seed skipped');
    } else if (result.ok) {
      app.log.info({ marketId, mid: result.mid, placements: result.placements.length }, 'mm seed ok');
    } else {
      app.log.warn({ marketId, reason: result.reason }, 'mm seed failed');
    }
  },
});

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));

app.get('/ready', async (_req, reply) => {
  if (!env.TRADE_SPOT_ENABLED) return reply.code(503).send({ ready: false, reason: 'trade.spot flag is off' });

  /**
   * Is the engine behind what we have already settled? (`spot/sequence-guard.ts`)
   *
   * A restart that lost the journal while Postgres kept `trade.fills` leaves the
   * engine re-issuing sequences that already identify settled trades — and
   * `fillIdFor(market, sequence)` is the ledger's idempotency key.
   *
   * `insertFillLeg` already refuses that at settlement, so nothing is
   * mis-settled either way. What this adds is WHEN it is noticed: on a probe a
   * load balancer reads, rather than on the first user whose order is refused.
   * A replica in this state was unfit the moment it finished booting.
   */
  const sequences = await checkEngineSequences({
    sql,
    markets: () => trade.markets(),
    engineSequence: async (marketId) => {
      try {
        return (await matching.depth(marketId, 1)).sequence;
      } catch {
        // Matching being unreachable is a different readiness question and not
        // this check's to answer — reported as unjudged, never as healthy.
        return null;
      }
    },
  });

  if (sequences.regressions.length > 0) {
    const reason = describeRegressions(sequences.regressions);
    app.log.error({ regressions: sequences.regressions }, reason);
    return reply.code(503).send({ ready: false, reason, markets: sequences.regressions.map((r) => r.symbol) });
  }

  // Counts, not a bare boolean: "checked 12" and "checked 0 because nothing has
  // traded yet" are different facts, and a probe that renders both as `true`
  // cannot tell an operator which one they are looking at.
  return { ready: true, engineSequences: { checked: sequences.checked, unjudged: sequences.unjudged } };
});

// Public CCXT-style REST (markets, orderbook, ticker, tickers, trades, ohlcv).
// No auth — market data is public. Paths match packages/exchange-contract
// REST_ROUTES; edge routes /api/v1 → here with path preserve and principal
// exchange (private routes below verify the edge signature).
// OHLCV is aggregated in SQL from the real taker fill tape — no candle is
// invented, and a bucket with no fills is absent rather than zero-filled.
registerPublicRest(app, {
  markets: () => trade.markets(),
  marketBySymbol: (symbol) => trade.marketBySymbol(symbol),
  depth: (marketId, limit) => matching.depth(marketId, limit),
  publicTape: (marketId, limit, sinceMs) => trade.publicTape(marketId, limit, sinceMs),
  candles: (marketId, timeframe, limit, sinceMs) => trade.candles(marketId, timeframe, limit, sinceMs),
  fundingRateForMarket: async (marketId, _symbol) => {
    const entry = futuresJobs.getPublishedRate(marketId);
    if (!entry) return null;
    const fundingDatetime = new Date(entry.asOfMs).toISOString();
    // Public mark: same non-inventing port as liquidation (venue fabric → depth).
    // Null when no book / unmapped — never invent index or mark.
    const markPrice = await futuresJobs.markPrice(marketId);
    return {
      fundingRate: entry.rate,
      fundingTimestamp: entry.asOfMs,
      fundingDatetime,
      nextFundingTimestamp: null,
      markPrice,
      indexPrice: null,
    };
  },
});

// S2S: oracle/ops publish funding rates (public GET only reflects published).
registerInternalFundingRate(app, {
  internalSecret: env.INTERNAL_SERVICE_SECRET,
  publishFundingRate: (entry) => futuresJobs.publishFundingRate(entry),
});

// Private CCXT REST — edge-signed principal, same trust boundary as tRPC.
// Create/cancel/cancelAll are the money path: TradeService only (no second hold).
// Balance is a self-only ledger projection (principal.userId → ledger.balances).
registerPrivateRest(app, {
  edgeSecret: env.EDGE_PRINCIPAL_SECRET,
  serviceName: env.SERVICE_NAME,
  openOrders: (principal, marketId) => trade.openOrders(principal, marketId),
  orderHistory: (principal, input) => trade.orderHistory(principal, input),
  getOrder: (principal, orderId) => trade.getOrder(principal, orderId),
  placeOrder: (principal, input) => trade.placeOrder(principal, input),
  cancelOrder: (principal, orderId) => trade.cancelOrder(principal, orderId),
  cancelAllOrders: (principal, marketId) => trade.cancelAllOrders(principal, marketId),
  myFills: (principal, limit, marketId, sinceMs) => trade.myFills(principal, limit, marketId, sinceMs),
  marketBySymbol: (symbol) => trade.marketBySymbol(symbol),
  marketById: (marketId) => trade.marketById(marketId),
  markets: () => trade.markets(),
  // Self-only: route always passes principal.userId — never client ownerId.
  userBalances: (userId) => ledger.balances('user', userId),
  listPositions: (principal, symbol) => positions.listOpen(principal.userId, symbol),
  openPosition: (principal, input) =>
    positions.open({
      userId: principal.userId,
      symbol: input.symbol,
      side: input.side,
      size: parseAmount(input.size),
      leverage: parseAmount(input.leverage),
      marginMode: input.marginMode,
    }),
  closePosition: (principal, positionId) => positions.close(principal.userId, positionId),
});

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<TradeRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info(
  {
    port: env.HTTP_PORT,
    spotEnabled: env.TRADE_SPOT_ENABLED,
    futuresJobsEnabled: env.TRADE_FUTURES_JOBS_ENABLED,
    futuresJobs: futuresJobs.host.list(),
    venueMark: venueMarkConfigured ? { venueId: venueMarkConfigured.venueId, symbols: venueMarkConfigured.symbolCount } : null,
    candleJobsEnabled: env.TRADE_CANDLE_JOBS_ENABLED,
    candleJobs: candleJobs.host.list(),
    mmSeedEnabled: env.TRADE_MM_SEED_ENABLED,
    mmSeedJobs: mmSeedJobs.host.list(),
    trpc: true,
    publicRest: [
      '/api/v1/markets',
      '/api/v1/orderbook/:symbol',
      '/api/v1/ticker/:symbol',
      '/api/v1/tickers',
      '/api/v1/trades/:symbol',
      '/api/v1/ohlcv/:symbol',
      '/api/v1/funding-rate/:symbol',
    ],
    privateRest: [
      'POST /api/v1/orders',
      'DELETE /api/v1/orders',
      'DELETE /api/v1/orders/:id',
      'GET /api/v1/orders/:id',
      'GET /api/v1/orders/open',
      'GET /api/v1/orders/closed',
      'GET /api/v1/account/trades',
      'GET /api/v1/account/fees',
      'GET /api/v1/account/balance',
      'GET /api/v1/positions',
      'POST /api/v1/positions',
      'DELETE /api/v1/positions/:id',
      'POST /api/v1/positions/leverage',
      'POST /api/v1/positions/margin-mode',
    ],
  },
  'svc-trade ready',
);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      futuresJobs.stop();
      candleJobs.stop();
      mmSeedJobs.stop();
      await app.close();
      for (const subscription of subscriptions) await subscription.unsubscribe();
      await bus.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
