import Fastify from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import { registerProcessHooks, startTelemetry } from '@intafaced/telemetry';
import { env } from './env.js';
import { loadMatchingVenueHalt } from './oms-matching-venue-halt.js';
import { createExecutionRouter, type ExecutionRouter } from './router.js';
import { registerStartBasketDoor } from './oms-basket-http.js';
import { registerKillParentDoor } from './oms-kill-parent-http.js';
import { InMemoryAlgoPauseStore } from './oms-pause.js';
import { InMemoryApprovedAlgoParentStore } from './oms-start.js';
import { registerOmsDisplayQtyDoor } from './oms-iceberg-http.js';
import { registerOmsPegDoor } from './oms-peg-http.js';
import { registerOmsOcoDoor } from './oms-oco-http.js';
import { registerOmsBuyingPowerDoor } from './oms-buying-power-http.js';
import { registerOmsMmpDoor } from './oms-mmp-http.js';
import { registerOmsCareDoor } from './oms-care-http.js';
import { registerOmsKillDoor } from './oms-kill-http.js';
import { registerOmsTcaDoor } from './oms-tca-http.js';
import { registerOmsPaperDoor } from './oms-paper-http.js';
import { registerOmsMultivenueDoor } from './oms-multivenue-http.js';
import { buildExecutionVenueAccountMapsWithOperatorSupplement } from './venue-account-adapters.js';
import {
  buildExecutionVenueTradeMapsWithOperatorSupplement,
  describeExecutionVenueCredentialBoard,
  parseExecutionVenueIds,
  unionExecutionVenueIds,
} from './venue-adapters.js';
import { buildExecutionVenueMarketMapsWithPublicMdSupplement } from './venue-market-adapters.js';
import { buildTradeBookSnapshotMap } from './trade-book-snapshot.js';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { FileEmsOrderStore } from './file-ems-order-store.js';
import { buildExecutionReadyResponse } from './ready-response.js';
import { createCaptureLakeRuntime } from './capture-lake-runtime.js';

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
 * Internal-book legs use the same OMS route and an explicitly injected submit adapter; no second book is created here.
 * In-memory sealed registry.
 */
const registry = new SealedHouseTenantRegistry();
const executionVenueIds = parseExecutionVenueIds(env.EXECUTION_VENUE_IDS);
const venueTradeMaps = buildExecutionVenueTradeMapsWithOperatorSupplement(executionVenueIds);
const venueAccountMaps = buildExecutionVenueAccountMapsWithOperatorSupplement(executionVenueIds);
const venueMarketMaps = buildExecutionVenueMarketMapsWithPublicMdSupplement(executionVenueIds);
const venueCredentialBoard = describeExecutionVenueCredentialBoard(
  unionExecutionVenueIds(executionVenueIds, venueTradeMaps.operatorSupplementVenueIds, venueAccountMaps.operatorSupplementVenueIds),
);
const emsStorePath = env.EXECUTION_EMS_STORE_PATH.trim();
const emsStore = emsStorePath ? new FileEmsOrderStore(emsStorePath) : new InMemoryEmsOrderStore();
const tradeBookSnapshot = buildTradeBookSnapshotMap(env.TRADE_URL);
const captureLakeRuntime = createCaptureLakeRuntime(env);
const snapshotByVenue = captureLakeRuntime.wrapSnapshotMap({
  ...venueMarketMaps.snapshotByVenue,
  ...tradeBookSnapshot,
});
captureLakeRuntime.start();
const algoJobs = { enabled: env.EXECUTION_ALGO_JOBS_ENABLED };
const matchingVenueHalt = () => loadMatchingVenueHalt({ matchingUrl: env.MATCHING_URL });
const parentStore = new InMemoryApprovedAlgoParentStore();
const pauseStore = new InMemoryAlgoPauseStore();
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
  captureLakeRuntime.lake,
  pauseStore,
  parentStore,
  algoJobs,
  undefined, // paper default off
  undefined, // fillConfirmStore default
  undefined, // manualFillStore default
  undefined, // fillAssignStore default
  matchingVenueHalt,
  env.MATCHING_URL,
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
    tradeUrl: env.TRADE_URL ?? '',
    venueTradeWiredVenueIds: venueTradeMaps.wiredVenueIds,
    operatorSupplementVenueIds: venueTradeMaps.operatorSupplementVenueIds,
    operatorAccountSupplementVenueIds: venueAccountMaps.operatorSupplementVenueIds,
    publicMdSupplementVenueIds: venueMarketMaps.publicMdSupplementVenueIds,
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

registerStartBasketDoor(app, {
  edgeContext,
  jobs: algoJobs,
  matchingVenueHalt,
  matchingUrl: env.MATCHING_URL,
});

registerOmsDisplayQtyDoor(app, {
  edgeContext,
});

registerOmsPegDoor(app, {
  edgeContext,
});
registerOmsOcoDoor(app, { edgeContext });
registerOmsBuyingPowerDoor(app, { edgeContext });
registerOmsMmpDoor(app, { edgeContext });
registerOmsCareDoor(app, { edgeContext });
registerOmsKillDoor(app, { edgeContext, emsStore, matchingVenueHalt });
registerKillParentDoor(app, {
  edgeContext,
  parentStore,
  pauseStore,
  emsStore,
  cancelByVenue: venueTradeMaps.cancelByVenue,
  matchingUrl: env.MATCHING_URL,
});
registerOmsTcaDoor(app, { edgeContext, emsStore, captureLake: captureLakeRuntime.lake });
registerOmsPaperDoor(app, { edgeContext });
registerOmsMultivenueDoor(app, { edgeContext, wiredVenueIds: venueTradeMaps.wiredVenueIds });

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT }, 'svc-execution ready');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await captureLakeRuntime.stop();
      await app.close();
      process.exit(0);
    })();
  });
}
