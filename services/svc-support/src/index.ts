import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { env } from './env.js';
import { createAccountStateClient } from './account-state.js';
import { SupportService } from './support-service.js';
import { PostgresSupportStore } from './store.js';
import { createSupportRouter, type SupportRouter } from './router.js';
import { deskVsAgentSplit } from './desk-vs-agent-split.js';
import { registerProcessHooks, startTelemetry } from '@intafaced/telemetry';

// §9 — register the TracerProvider before the first span is created.
registerProcessHooks(
  startTelemetry({
    serviceName: env.SERVICE_NAME,
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    enabled: env.OTEL_ENABLED,
    environment: env.APP_ENV,
  }),
);

/**
 * svc-support — tickets + KB + operator queue (ops.support).
 * Durable Postgres store. No ledger. No balances.
 */
const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'support,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM support.tickets LIMIT 1`.catch(() => {
  throw new Error('support schema is missing — run migrations before starting svc-support');
});

// Migration 0001 is checked separately from 0000. A desk booting on 0000 alone
// would serve tickets and silently record no history — the audit trail would be
// permanently empty and nothing would say why, which is the failure mode this
// whole slice exists to remove.
await sql`SELECT 1 FROM support.ticket_events LIMIT 1`.catch(() => {
  throw new Error('support.ticket_events is missing — apply migration 0001 before starting svc-support');
});

await sql`SELECT 1 FROM support.kb_articles LIMIT 1`.catch(() => {
  throw new Error('support.kb_articles is missing — apply migration 0003 before starting svc-support');
});

const store = new PostgresSupportStore(sql);
// Account state is READ from svc-identity per request, never cached here.
const accounts = createAccountStateClient(env.IDENTITY_URL, env.INTERNAL_SERVICE_SECRET);
const support = new SupportService(store, accounts);
const appRouter = createSupportRouter(support);
const edgeContext = createEdgeContext({
  secret: env.EDGE_PRINCIPAL_SECRET,
  serviceName: env.SERVICE_NAME,
});

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => {
  // D26-P1-O3: desk mountain vs agents.support assist — same constants as tests.
  const split = deskVsAgentSplit();
  return {
    ready: true,
    stage: split.stage,
    store: 'postgres',
    // Named so an operator can tell "no account state was readable" from "this
    // desk was never pointed at an identity service" without reading the logs.
    accountStateSource: split.accountStateSource,
    deskMountain: split.deskMountain,
    agentAssist: split.agentAssist,
    deskStandalone: split.deskStandalone,
  };
});

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<SupportRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT }, 'svc-support ready');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
