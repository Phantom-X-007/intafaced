import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { TradeService } from './spot/trade-service.js';
import { createMatchingClient } from './spot/matching-client.js';
import { createRankPerksClient } from './spot/rank-perks.js';
import { createLedgerClient } from './ledger-client.js';
import { subscribeMatchingEvents } from './events.js';
import { createTradeRouter, type TradeRouter } from './router.js';
import { registerPublicRest } from './public-rest.js';
import { registerPrivateRest } from './private-rest.js';

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
const perks = createRankPerksClient(env.IDENTITY_URL);

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
});

const subscriptions = await subscribeMatchingEvents(bus, trade);

export const appRouter = createTradeRouter(trade);
export type AppRouter = typeof appRouter;

const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));

app.get('/ready', async (_req, reply) => {
  if (!env.TRADE_SPOT_ENABLED) return reply.code(503).send({ ready: false, reason: 'trade.spot flag is off' });
  return { ready: true };
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
      'POST /api/v1/positions/leverage',
      'POST /api/v1/positions/margin-mode',
    ],
  },
  'svc-trade ready',
);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      for (const subscription of subscriptions) await subscription.unsubscribe();
      await bus.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
