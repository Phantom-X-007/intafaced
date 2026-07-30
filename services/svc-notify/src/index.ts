import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { JetStreamEventBus, type Subscription } from '@intafaced/events';
import { env } from './env.js';
import { PostgresNotifyStore } from './store.js';
import { NotifyService } from './notify-service.js';
import { createNotifyRouter, type NotifyRouter } from './router.js';
import { subscribeNotificationEvents } from './events.js';

/**
 * svc-notify — in-app notification inbox (ops.notifications).
 *
 * Phase 5. Event-driven fan-out into an in-app inbox only. Push, email and SMS
 * are §13 sockets — this process never opens those channels and never holds a
 * balance (Doctrine §0.6).
 *
 * Graph: mount tRPC with edge-signed principal; durable bus consumers for
 * fillSettled, p2pEscrowLocked/Released/Refunded, p2pTradeDisputed, kycApproved,
 * rankUpdated, stakeCreated.
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

// Consumer only — trade / p2p / identity own their streams. ownedStreams: []
// matches svc-ws: we never create a stream for subjects we do not publish.
const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  ownedStreams: [],
});

const store = new PostgresNotifyStore(sql);
const notify = new NotifyService(store, { fanoutEnabled: env.NOTIFY_FANOUT_ENABLED });

export const appRouter = createNotifyRouter(notify);
export type AppRouter = typeof appRouter;

const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({
  ready: true,
  fanoutEnabled: env.NOTIFY_FANOUT_ENABLED,
}));

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<NotifyRouter>['trpcOptions'],
});

const subs: Subscription[] = await subscribeNotificationEvents(bus, notify);

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info(
  {
    port: env.HTTP_PORT,
    fanoutEnabled: env.NOTIFY_FANOUT_ENABLED,
    consumers: [
      'notify-fill-settled',
      'notify-p2p-escrow-locked',
      'notify-p2p-escrow-released',
      'notify-p2p-escrow-refunded',
      'notify-p2p-trade-disputed',
      'notify-kyc-approved',
      'notify-rank-updated',
      'notify-stake-created',
    ],
    trpc: true,
  },
  'svc-notify ready',
);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      for (const sub of subs) await sub.unsubscribe().catch(() => undefined);
      await app.close();
      await bus.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
