import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { registerProcessHooks, startTelemetry } from '@intafaced/telemetry';
import { env } from './env.js';
import { VendorService } from './vendor-service.js';
import { createMarketRouter, type MarketRouter } from './router.js';

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
 * svc-market — vendor lifecycle Stage 1: apply, then vet (§8.7).
 *
 * NO LEDGER CLIENT and no LEDGER_URL. `market.vendors` moves no value: purchases,
 * subscriptions and house commission are `market.commerce`, a different mountain
 * (§0.6). There is no credential in this process that could reach anything which
 * moves value.
 *
 * NO BUS CONNECTION, and that is worth stating because most services here have
 * one. This service publishes nothing: an accepted bus subject for vendor
 * lifecycle events does not exist yet, and connecting to NATS to publish nothing
 * would add a boot dependency that can fail in exchange for no capability at all
 * (see README "Events").
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'market,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

// Fail at boot, loudly, rather than answering the first real request with
// "relation does not exist" — which reads as a broken query rather than a
// migration that never ran.
await sql`SELECT 1 FROM market.vendors LIMIT 1`.catch(() => {
  throw new Error('market schema is missing — run migrations before starting svc-market');
});

const vendors = new VendorService(sql);
const appRouter = createMarketRouter(vendors);

// Built before the listener opens: a service that cannot authenticate the edge
// must fail to start, not start and serve every request as anonymous.
const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));

/**
 * Readiness names the stage out loud. `market.listings` and the stake-gated slots
 * behind it are Stage 2 and 3; a client that reads `stage` knows the listing half
 * of the marketplace is not there yet, rather than discovering it from a 404.
 */
app.get('/ready', async () => ({ ready: true, stage: '1-apply-vet' }));

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    // The edge terminates auth and forwards the resolved principal; this service
    // never parses a token itself (§4.1 owns that). It does verify the edge's
    // signature over that principal — see packages/contracts/src/edge.ts for why
    // an unsigned header makes every scope check decorative.
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<MarketRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT, stage: '1-apply-vet', trpc: true }, 'svc-market ready');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
