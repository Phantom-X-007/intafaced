import Fastify from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { registerProcessHooks, startTelemetry } from '@intafaced/telemetry';
import { env } from './env.js';
import { createOpsRouter, type OpsRouter } from './router.js';
import { OpsService } from './ops-service.js';
import { OPS_IDENTITY_UNWIRED, OPS_SUPPORT_UNWIRED } from './codes.js';
import { opsReadyUrlHonesty } from './ready-honesty.js';

registerProcessHooks(
  startTelemetry({
    serviceName: env.SERVICE_NAME,
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    enabled: env.OTEL_ENABLED,
    environment: env.APP_ENV,
  }),
);

/**
 * svc-ops — CRM / team / warehouse revenue / projects / fundraising records.
 * No balances of its own. Unwired warehouse refuses ops.warehouse_unwired.
 * Payroll is never invented. Fundraising fund/escrow refuses ops.fundraising_chain_unwired.
 * Custody wrap blank refuses ops.custody_wrap_unset. Keys stay empty — never invented.
 * Freeze policy blank/unknown refuses ops.custody_freeze_unset; frozen refuses ops.custody_frozen.
 */
const ops = new OpsService({
  warehouseEnv: process.env,
  custodyWrap: env.OPS_CUSTODY_WRAP,
  custodyFreezePolicy: env.OPS_CUSTODY_FREEZE_POLICY,
  identitySource: async () => ({ status: 'absent', code: OPS_IDENTITY_UNWIRED, rows: [] }),
  supportSource: async () => ({ status: 'absent', code: OPS_SUPPORT_UNWIRED, rows: [] }),
  identityTeamSource: async () => ({ status: 'absent', code: OPS_IDENTITY_UNWIRED, rows: [] }),
});

const appRouter = createOpsRouter(ops);
const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME, custodial: false }));
app.get('/ready', async () => ({
  ready: true,
  custodial: false,
  // Env URL is configured, not a live probe. This process does not fetch.
  ...opsReadyUrlHonesty(env),
}));

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<OpsRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT }, 'svc-ops ready');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      process.exit(0);
    })();
  });
}
