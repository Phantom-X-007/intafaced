import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
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
 * Graph W1-R: mount tRPC (hybrid default — trade self-mounts).
 * Money posts still require ledger S2S (W1-C) and purpose-keyed holds (Denon)
 * before any real-user deploy.
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

const ledger = createLedgerClient(env.LEDGER_URL);
const matching = createMatchingClient(env.MATCHING_URL);
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
});

const subscriptions = await subscribeMatchingEvents(bus, trade);

export const appRouter = createTradeRouter(trade);
export type AppRouter = typeof appRouter;

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
    createContext: ({ req }) => ({
      principal: (req.headers['x-intafaced-principal']
        ? JSON.parse(String(req.headers['x-intafaced-principal']))
        : null) as never,
      region: String(req.headers['x-intafaced-region'] ?? 'XX'),
      requestId: String(req.id),
      ...(req.headers.traceparent ? { traceparent: String(req.headers.traceparent) } : {}),
    }),
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
