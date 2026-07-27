import Fastify from 'fastify';
import postgres from 'postgres';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { TradeService } from './spot/trade-service.js';
import { createMatchingClient } from './spot/matching-client.js';
import { createRankPerksClient } from './spot/rank-perks.js';
import { createLedgerClient } from './ledger-client.js';
import { subscribeMatchingEvents } from './events.js';
import { createTradeRouter } from './router.js';

/**
 * svc-trade — the product layer over the matching engine (§5.2).
 *
 * Boot order matters. The database and the ledger client come up before the
 * event subscriptions, because the first thing a `intafaced.matching.order.filled`
 * redelivery will do is try to settle a fill — and a consumer that starts
 * before it can post to the ledger is a consumer that fails its first message.
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
const ledger = createLedgerClient(env.LEDGER_URL);

// The book lives in svc-matching. This service never runs one of its own —
// §5.1 draws that line and a second book would be a second truth.
const matching = createMatchingClient(env.MATCHING_URL);

// One field, read once per order: `feeDiscountBps` (§4.1).
const perks = createRankPerksClient(env.IDENTITY_URL);

const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  // This service owns no stream: it publishes only `intafaced.identity.xp.earned`,
  // which svc-identity owns, and consumes `intafaced.matching.*`.
  ownedStreams: [],
});

const trade = new TradeService(sql, ledger, matching, perks, bus, {
  spotEnabled: env.TRADE_SPOT_ENABLED,
  marketSlippageCapBps: env.TRADE_MARKET_SLIPPAGE_CAP_BPS,
});

const subscriptions = await subscribeMatchingEvents(bus, trade);

export const appRouter = createTradeRouter(trade);
export type AppRouter = typeof appRouter;

const app = Fastify({ logger: { level: env.LOG_LEVEL } });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));

/**
 * Readiness is stricter than liveness. With the kill-switch off this service is
 * alive — it still serves listings, still reports orders, and still CANCELS —
 * but it must not receive new orders, so the load balancer takes it out of the
 * order-placement rotation rather than letting every submission come back
 * refused.
 */
app.get('/ready', async (_req, reply) => {
  if (!env.TRADE_SPOT_ENABLED) return reply.code(503).send({ ready: false, reason: 'trade.spot flag is off' });
  return { ready: true };
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT, spotEnabled: env.TRADE_SPOT_ENABLED }, 'svc-trade ready');

// Draining, not dropping: an in-flight order finishes its hold-submit-settle
// sequence before the process exits. Dropping one mid-flight is precisely how a
// hold outlives the order it was taken for.
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
