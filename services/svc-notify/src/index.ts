import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { PostgresNotifyStore } from './store.js';
import { PostgresDeliveryStore, PostgresTargetStore } from './channel-store.js';
import { channelsFromEnv } from './channels/registry.js';
import { NotificationDispatcher } from './dispatch.js';
import { NotifyService } from './notify-service.js';
import { createNotifyRouter, type NotifyRouter } from './router.js';
import { subscribeNotificationEvents } from './events.js';

/**
 * svc-notify — event-driven fan-out (ops.notifications).
 *
 * Phase 5. In-app inbox, plus email / push / SMS behind one internal adapter
 * interface (§0.4). This process holds no balance (§0.6) and posts no ledger
 * transaction: it moves messages, not money.
 *
 * WHAT AN OPERATOR SHOULD READ ON BOOT
 *
 * `/ready` reports two things that are easy to get wrong and expensive to
 * discover late:
 *
 *   channels          which transports have credentials, which ones this
 *                     deployment declared it DEPENDS ON, and the env vars each
 *                     missing one needs. A channel with none is not "off" — it
 *                     refuses every message with a code that lands on the
 *                     delivery record.
 *   pendingConsumers  subjects whose stream does not exist yet because the
 *                     producing service has not connected a bus. Nothing is
 *                     lost — the durable consumer attaches on a later boot and
 *                     JetStream replays the stream from the start — but it is
 *                     stated rather than left to be noticed.
 *
 * WHAT AN OPERATOR WILL NEVER READ HERE
 *
 * A required channel that is not wired. `env.ts` refuses to load in that state,
 * so this file is not reached — see NOTIFY_REQUIRED_CHANNELS. The unavailable
 * warnings below are therefore only ever about channels the operator chose not
 * to depend on.
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'notify,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM notify.notifications LIMIT 1`.catch(() => {
  throw new Error('notify schema is missing — run migrations before starting svc-notify');
});
await sql`SELECT 1 FROM notify.deliveries LIMIT 1`.catch(() => {
  throw new Error('notify.deliveries is missing — run migration 0001_notify_channels before starting svc-notify');
});

// Consumer only — trade / p2p / identity / token / bank own their streams.
// `ownedStreams: []` matches svc-ws: we never create a stream for subjects we do
// not publish, because a stream we created would accept publishes from nobody
// and quietly look healthy.
const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  ownedStreams: [],
});

const store = new PostgresNotifyStore(sql);
const targets = new PostgresTargetStore(sql);
const deliveries = new PostgresDeliveryStore(sql);
const channels = channelsFromEnv(env);
const dispatcher = new NotificationDispatcher(channels, targets, deliveries, {
  maxAttempts: env.NOTIFY_MAX_DELIVERY_ATTEMPTS,
  outOfAppEnabled: env.NOTIFY_OUT_OF_APP_ENABLED,
});

const notify = new NotifyService(
  store,
  { fanoutEnabled: env.NOTIFY_FANOUT_ENABLED, verifyTtlMinutes: env.NOTIFY_VERIFY_TTL_MINUTES },
  { targets, deliveries, channels, dispatcher },
);

export const appRouter = createNotifyRouter(notify);
export type AppRouter = typeof appRouter;

const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

const { subscriptions, pending } = await subscribeNotificationEvents(bus, notify);

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({
  ready: true,
  fanoutEnabled: env.NOTIFY_FANOUT_ENABLED,
  outOfAppEnabled: env.NOTIFY_OUT_OF_APP_ENABLED,
  channels: channels.status(),
  consumers: subscriptions.length,
  // Each entry carries its `socket` — the recorded reason it cannot attach, or
  // null. Null is the one worth paging on, so it gets its own count rather than
  // making a monitor parse the array to find out.
  pendingConsumers: pending,
  undeclaredPendingConsumers: pending.filter((c) => c.socket === null).length,
}));

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<NotifyRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });

app.log.info(
  {
    port: env.HTTP_PORT,
    fanoutEnabled: env.NOTIFY_FANOUT_ENABLED,
    outOfAppEnabled: env.NOTIFY_OUT_OF_APP_ENABLED,
    channels: channels.status(),
    consumers: subscriptions.length,
    trpc: true,
  },
  'svc-notify ready',
);

for (const consumer of pending) {
  // A pending consumer is a DECLARED SOCKET or a DEFECT, and never both — see
  // the `PendingConsumer` docstring in ./events.ts.
  //
  // This was one WARN per pending consumer. `bankMarginCalled` has been pending
  // since svc-notify shipped, so that warning has fired on every boot this
  // service has ever had. A warning that is always present is not a warning; it
  // is a permanent feature of the log, and it trains whoever reads it to skim
  // past warnings — including the next one, about something that just broke.
  if (consumer.socket !== null) {
    app.log.info(
      { subject: consumer.subject, durable: consumer.durable, socket: consumer.socket },
      'svc-notify consumer parked on a declared socket — its publisher does not exist yet, that is recorded in the event catalog with a reason, and the consumer attaches on the first boot after one appears',
    );
    continue;
  }
  app.log.error(
    { subject: consumer.subject, durable: consumer.durable, reason: consumer.reason },
    'svc-notify consumer cannot attach and NOTHING DECLARES WHY — notifications for this subject are dark. Wire its publisher, or record it in WIRING_SOCKETS with a reason (pnpm scan:events fails on an undeclared one, so this should never reach main)',
  );
}

for (const channel of channels.status()) {
  if (channel.available) continue;
  app.log.warn(
    { channel: channel.channel, reason: channel.reason, requires: channel.requires },
    'svc-notify channel unavailable — it will refuse every message and record the refusal',
  );
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      for (const sub of subscriptions) await sub.unsubscribe().catch(() => undefined);
      await app.close();
      await bus.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
