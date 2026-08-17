import Fastify from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import { registerProcessHooks, startTelemetry } from '@intafaced/telemetry';
import { env } from './env.js';
import { createExecutionRouter, type ExecutionRouter } from './router.js';

registerProcessHooks(
  startTelemetry({
    serviceName: env.SERVICE_NAME,
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    enabled: env.OTEL_ENABLED,
    environment: env.APP_ENV,
  }),
);

/**
 * svc-execution — house tenancy (D26-P0-01) + OMS plan/execute (D26-P1-X3).
 *
 * Health + tRPC `execution.tenant.*` (describe / kill), `execution.oms.plan`
 * (SOR `planRoute`, does not submit), `execution.oms.execute` (same plan,
 * then injected submit), `execution.oms.cancel` (client order id),
 * `execution.oms.fetch` (client order id), `execution.oms.openOrders`,
 * `execution.oms.balances`, `execution.oms.positions`,
 * `execution.oms.rails` (not a transfer), and `execution.oms.funding`
 * (venue observation — not a ledger read / not a settlement).
 * No live CEX keys. Internal venues refused. In-memory sealed registry.
 */
const registry = new SealedHouseTenantRegistry();
const appRouter = createExecutionRouter(registry);
const edgeContext = createEdgeContext({
  secret: env.EDGE_PRINCIPAL_SECRET,
  serviceName: env.SERVICE_NAME,
});

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({
  ready: true,
  stage: 'oms-funding',
  store: 'memory',
  internalVenue: 'blocked',
}));

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<ExecutionRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT }, 'svc-execution ready');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      process.exit(0);
    })();
  });
}
