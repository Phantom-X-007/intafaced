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
  ownedStreams: [],
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

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<TradeRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT, spotEnabled: env.TRADE_SPOT_ENABLED, trpc: true }, 'svc-trade ready');

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
