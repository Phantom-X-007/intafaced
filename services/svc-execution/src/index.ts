import Fastify from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import { registerProcessHooks, startTelemetry } from '@intafaced/telemetry';
import { env } from './env.js';
import { createExecutionRouter, type ExecutionRouter } from './router.js';
import { buildExecutionVenueAccountMaps } from './venue-account-adapters.js';
import { buildExecutionVenueTradeMaps, parseExecutionVenueIds } from './venue-adapters.js';

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
 * External spot venues wire from EXECUTION_VENUE_IDS + per-venue EXECUTION_VENUE_{ID}_* credentials.
 * Internal venues refused. No matching-path privilege. In-memory sealed registry.
 */
const registry = new SealedHouseTenantRegistry();
const executionVenueIds = parseExecutionVenueIds(env.EXECUTION_VENUE_IDS);
const venueTradeMaps = buildExecutionVenueTradeMaps(executionVenueIds);
const venueAccountMaps = buildExecutionVenueAccountMaps(executionVenueIds);
const appRouter = createExecutionRouter(
  registry,
  venueTradeMaps.submitByVenue,
  venueTradeMaps.cancelByVenue,
  venueTradeMaps.fetchByVenue,
  venueTradeMaps.openOrdersByVenue,
  venueAccountMaps.balancesByVenue,
  venueAccountMaps.positionsByVenue,
  venueAccountMaps.railsByVenue,
);
const edgeContext = createEdgeContext({
  secret: env.EDGE_PRINCIPAL_SECRET,
  serviceName: env.SERVICE_NAME,
});

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({
  ready: true,
  stage: 'oms-snapshot',
  store: 'memory',
  internalVenue: 'blocked',
  externalVenueTrade: venueTradeMaps.wiredVenueIds,
  externalVenueAccount: venueAccountMaps.wiredVenueIds,
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
