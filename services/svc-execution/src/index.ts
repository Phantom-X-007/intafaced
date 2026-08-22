import Fastify from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import { registerProcessHooks, startTelemetry } from '@intafaced/telemetry';
import { env } from './env.js';
import { createExecutionRouter, type ExecutionRouter } from './router.js';
import { buildExecutionVenueAccountMaps } from './venue-account-adapters.js';
import {
  buildExecutionVenueTradeMapsWithOperatorSupplement,
  describeExecutionVenueCredentialBoard,
  parseExecutionVenueIds,
} from './venue-adapters.js';
import { buildExecutionVenueMarketMaps } from './venue-market-adapters.js';
import { buildTradeBookSnapshotMap } from './trade-book-snapshot.js';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { FileEmsOrderStore } from './file-ems-order-store.js';
import { buildExecutionReadyResponse } from './ready-response.js';

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
const venueCredentialBoard = describeExecutionVenueCredentialBoard(executionVenueIds);
const venueTradeMaps = buildExecutionVenueTradeMapsWithOperatorSupplement(executionVenueIds);
const venueAccountMaps = buildExecutionVenueAccountMaps(executionVenueIds);
const venueMarketMaps = buildExecutionVenueMarketMaps(executionVenueIds);
const emsStorePath = env.EXECUTION_EMS_STORE_PATH.trim();
const emsStore = emsStorePath ? new FileEmsOrderStore(emsStorePath) : new InMemoryEmsOrderStore();
const tradeBookSnapshot = buildTradeBookSnapshotMap(env.TRADE_URL);
const snapshotByVenue = { ...venueMarketMaps.snapshotByVenue, ...tradeBookSnapshot };
const appRouter = createExecutionRouter(
  registry,
  venueTradeMaps.submitByVenue,
  venueTradeMaps.cancelByVenue,
  venueTradeMaps.fetchByVenue,
  venueTradeMaps.openOrdersByVenue,
  venueAccountMaps.balancesByVenue,
  venueAccountMaps.positionsByVenue,
  venueAccountMaps.railsByVenue,
  venueMarketMaps.fundingByVenue,
  venueMarketMaps.borrowByVenue,
  venueMarketMaps.latencyByVenue,
  venueMarketMaps.marketsByVenue,
  snapshotByVenue,
  emsStore,
);
const edgeContext = createEdgeContext({
  secret: env.EDGE_PRINCIPAL_SECRET,
  serviceName: env.SERVICE_NAME,
});

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () =>
  buildExecutionReadyResponse({
    emsStorePath,
    tradeUrl: env.TRADE_URL,
    venueTradeWiredVenueIds: venueTradeMaps.wiredVenueIds,
    operatorSupplementVenueIds: venueTradeMaps.operatorSupplementVenueIds,
    venueCredentialBoard,
    venueAccountWiredVenueIds: venueAccountMaps.wiredVenueIds,
    venueMarketWiredVenueIds: venueMarketMaps.wiredVenueIds,
    emsAckCount: emsStore.list().length,
  }),
);

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
