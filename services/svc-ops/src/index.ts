import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { migrateOutreach } from './db/migrate.js';
import { OutreachCrm } from './outreach/crm.js';
import { createFounderAuthority } from './outreach/authority.js';
import { createClientIpResolver } from './outreach/client-ip.js';
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
 * No balances of its own. That is not a certified non-custodial plane.
 * Unwired warehouse refuses ops.warehouse_unwired.
 * Payroll is never invented. Fundraising fund/escrow refuses ops.fundraising_chain_unwired.
 * Custody wrap blank refuses ops.custody_wrap_unset. Keys stay empty — never invented.
 * Freeze policy blank/unknown refuses ops.custody_freeze_unset; frozen refuses ops.custody_frozen.
 */
const ops = new OpsService({
  warehouseEnv: process.env,
  custodyWrap: env.OPS_CUSTODY_WRAP,
  custodyFreezePolicy: env.OPS_CUSTODY_FREEZE_POLICY,
  // Hardcoded absent — IDENTITY_URL / SUPPORT_URL are not clients. Do not fetch.
  identitySource: async () => ({ status: 'absent', code: OPS_IDENTITY_UNWIRED, rows: [] }),
  supportSource: async () => ({ status: 'absent', code: OPS_SUPPORT_UNWIRED, rows: [] }),
  identityTeamSource: async () => ({ status: 'absent', code: OPS_IDENTITY_UNWIRED, rows: [] }),
});

let crmSql: ReturnType<typeof postgres> | null = null;
const poolMax = Number(process.env.OPS_DATABASE_POOL_MAX);
if (process.env.DATABASE_URL && Number.isInteger(poolMax) && poolMax > 0) {
  const candidate = postgres(process.env.DATABASE_URL, {
    max: poolMax,
    onnotice: () => undefined,
    connection: { application_name: 'ops', statement_timeout: 15000 },
  });
  try {
    await migrateOutreach(candidate);
    crmSql = candidate;
  } catch {
    await candidate.end({ timeout: 1 });
  }
}
let outreachConfiguration: unknown = null;
try {
  outreachConfiguration = JSON.parse(process.env.OPS_OUTREACH_CONFIG ?? 'null');
} catch {
  /* Invalid configuration refuses intake. */
}
const crm = new OutreachCrm(crmSql, outreachConfiguration);
const appRouter = createOpsRouter(ops, {
  crm,
  authority: createFounderAuthority({
    identityUrl: env.IDENTITY_URL,
    serviceSecret: process.env.INTERNAL_SERVICE_SECRET,
    principalSecret: env.EDGE_PRINCIPAL_SECRET,
  }),
});
const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const resolveClientIp = createClientIpResolver(process.env.OPS_TRUSTED_PROXY_CIDRS);
const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000, trustProxy: false });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({
  ready: true,
  // Env URL is configured, not a live probe. Sources stay hardcoded-absent. This process does not fetch.
  ...opsReadyUrlHonesty(env),
  outreach: { storage: crmSql ? 'configured' : 'unavailable', engagement: { status: 'disabled', reason: 'api_access_unavailable' } },
}));

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: async ({ req }) => ({
      ...(await edgeContext({ headers: req.headers, id: req.id })),
      outreachAbuseKey: createHash('sha256')
        .update(resolveClientIp(req.raw.socket.remoteAddress, req.headers['x-intafaced-client-ip']))
        .digest('hex'),
    }),
  } satisfies FastifyTRPCPluginOptions<OpsRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT }, 'svc-ops ready');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      await crmSql?.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
