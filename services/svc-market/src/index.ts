import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { registerProcessHooks, startTelemetry } from '@intafaced/telemetry';
import { env } from './env.js';
import { VendorService } from './vendor-service.js';
import { createStakeSource } from './stake-source.js';
import { createMarketRouter, type MarketRouter } from './router.js';
import { CommerceService } from './commerce/commerce-service.js';
import { createLedgerClient } from './ledger-client.js';

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
 * svc-market — vendor lifecycle (Stages 1–3) + market.commerce listings and
 * one-time purchase with house commission (§8.7).
 *
 * Balances live in svc-ledger only. Commission bps is owner-gated: unset env
 * refuses createListing + purchase and empties the public catalogue rather
 * than inventing a rate (D26-P1-M1 / M2). Compose wires LEDGER_URL to
 * svc-ledger; MARKET_HOUSE_COMMISSION_BPS is owner-published (0 = explicit
 * free-cut in `.env.example`); compose pass-through, no in-code default.
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'market,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM market.vendors LIMIT 1`.catch(() => {
  throw new Error('market schema is missing — run migrations before starting svc-market');
});
await sql`SELECT 1 FROM market.vendor_slots LIMIT 1`.catch(() => {
  throw new Error('market.vendor_slots is missing — run migrations before starting svc-market');
});
await sql`SELECT 1 FROM market.listings LIMIT 1`.catch(() => {
  throw new Error('market.listings is missing — run migrations before starting svc-market');
});
await sql`SELECT 1 FROM market.purchases LIMIT 1`.catch(() => {
  throw new Error('market.purchases is missing — run migrations before starting svc-market');
});

const vendors = new VendorService(sql, createStakeSource(env.TOKEN_URL, env.INTERNAL_SERVICE_SECRET));
const ledger = createLedgerClient(env.LEDGER_URL, env.INTERNAL_SERVICE_SECRET);
const commerce = new CommerceService(sql, vendors, ledger, {
  commissionBps: env.MARKET_HOUSE_COMMISSION_BPS ?? null,
});
const appRouter = createMarketRouter(vendors, commerce);

const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));

app.get('/ready', async () => ({
  ready: true,
  stage: 'commerce-one-time',
  commissionConfigured: env.MARKET_HOUSE_COMMISSION_BPS !== undefined,
}));

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<MarketRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info(
  {
    port: env.HTTP_PORT,
    stage: 'commerce-one-time',
    commissionConfigured: env.MARKET_HOUSE_COMMISSION_BPS !== undefined,
    trpc: true,
  },
  'svc-market ready',
);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
