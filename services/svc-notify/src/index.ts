import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { PostgresNotifyStore } from './store.js';
import { DELIVERY_REAP_INTERVAL_MS, PostgresDeliveryStore, PostgresTargetStore } from './channel-store.js';
import { channelsFromEnv } from './channels/registry.js';
import { NotificationDispatcher } from './dispatch.js';
import { PostgresMuteStore } from './preferences/mute-store.js';
import { NotifyService } from './notify-service.js';
import { createNotifyRouter, type NotifyRouter } from './router.js';
import { subscribeNotificationEvents } from './events.js';
import { registerProcessHooks, startTelemetry } from '@intafaced/telemetry';

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
await sql`SELECT 1 FROM notify.channel_mutes LIMIT 1`.catch(() => {
  throw new Error('notify.channel_mutes is missing — run migration 0003_notify_mute_prefs before starting svc-notify');
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
// The claim lease has to outlast one gateway attempt and stay under the bus
// `ack_wait`. Deriving it from the configured timeout keeps the first half true
// when an operator changes that timeout — see DEFAULT_CLAIM_LEASE_MS.
const deliveries = new PostgresDeliveryStore(sql, { leaseMs: env.NOTIFY_GATEWAY_TIMEOUT_MS * 2 });
const channels = channelsFromEnv(env);
const muteStore = new PostgresMuteStore(sql);
const dispatcher = new NotificationDispatcher(channels, targets, deliveries, {
  maxAttempts: env.NOTIFY_MAX_DELIVERY_ATTEMPTS,
  outOfAppEnabled: env.NOTIFY_OUT_OF_APP_ENABLED,
  mutePrefsOf: (userId) => muteStore.get(userId),
});

const notify = new NotifyService(
  store,
  { fanoutEnabled: env.NOTIFY_FANOUT_ENABLED, verifyTtlMinutes: env.NOTIFY_VERIFY_TTL_MINUTES },
  { targets, deliveries, channels, dispatcher, muteStore },
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

/**
 * The delivery sweep — see `DeliveryStore.reapExhausted`.
 *
 * The only writer of `abandoned` used to be `claim`, which needs a bus
 * redelivery to run. When the attempt ceiling and `max_deliver` are reached by
 * the same message, no redelivery follows and the row keeps saying `pending` on
 * a screen the user reads to find out whether their margin call went out.
 *
 * FAIL-SAFE, DELIBERATELY. A sweep that cannot run must never take the inbox
 * down with it: a database blip here costs a stale status line, and refusing to
 * serve notifications over it would be the larger outage. So it logs and waits
 * for the next tick. `unref` keeps it out of the way of shutdown.
 */
const reaper = setInterval(() => {
  void deliveries
    .reapExhausted(env.NOTIFY_MAX_DELIVERY_ATTEMPTS)
    .then((retired) => {
      if (retired > 0) {
        app.log.info(
          { retired, maxAttempts: env.NOTIFY_MAX_DELIVERY_ATTEMPTS },
          'svc-notify retired delivery rows that had run out of attempts — they now read as abandoned rather than pending',
        );
      }
    })
    .catch((err) => {
      app.log.error({ err }, 'svc-notify delivery sweep failed — finished rows may still read as pending until the next tick');
    });
}, DELIVERY_REAP_INTERVAL_MS);
reaper.unref();

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
  // Declared sockets log at info (known gap). Undeclared pending is an error —
  // notifications for that subject are dark and nothing in WIRING_SOCKETS admits it.
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
      clearInterval(reaper);
      for (const sub of subscriptions) await sub.unsubscribe().catch(() => undefined);
      await app.close();
      await bus.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
