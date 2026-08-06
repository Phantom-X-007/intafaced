import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext, verifyServiceHeaders } from '@intafaced/contracts';
import { JetStreamEventBus } from '@intafaced/events';
import { formatAmount } from '@intafaced/ledger-client';
import { env } from './env.js';
import { TokenService } from './token-service.js';
import { createLedgerClient } from './ledger-client.js';
import { createTokenRouter, type TokenRouter } from './router.js';
import { registerProcessHooks, startTelemetry } from '@intafaced/telemetry';

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
 * svc-token — the native economy (§4.3).
 *
 * Graph W1-C: mount tRPC with edge-signed principal; keep /internal/stake for S2S.
 *
 * Emissions: operator calls `mintEpoch` (admin:treasury), or enable
 * EMISSIONS_AUTO_TICK to mint the next sequential epoch on an interval.
 * Both paths refuse when EMISSIONS_ENABLED=false.
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'token,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM token.token_params LIMIT 1`.catch(() => {
  throw new Error('token schema is missing — run migrations before starting svc-token');
});

const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  ownedStreams: ['token'],
});

// Value moves through svc-ledger, never through this service's own tables
// (Doctrine §0.6). This client is the only path.
const ledger = createLedgerClient(env.LEDGER_URL, env.INTERNAL_SERVICE_SECRET);

const token = new TokenService(sql, ledger, bus, {
  assetId: env.TOKEN_ASSET_ID,
  // T-02: buyback + emission from token_params, not code defaults.
  loadParamsFromDb: true,
});

export const appRouter = createTokenRouter(token, { emissionsEnabled: env.EMISSIONS_ENABLED });
export type AppRouter = typeof appRouter;

const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({
  ready: true,
  emissionsEnabled: env.EMISSIONS_ENABLED,
  emissionsAutoTick: env.EMISSIONS_AUTO_TICK,
}));

app.get<{ Params: { userId: string } }>('/internal/stake/:userId', async (req, reply) => {
  if (verifyServiceHeaders(req.headers, env.INTERNAL_SERVICE_SECRET).service === null) {
    return reply.code(401).send({ error: 'service credentials required', code: 'token.unauthenticated' });
  }
  const access = await token.accessOf(req.params.userId);
  return { staked: access.staked.toString(), tier: access.tier, feeDiscountBps: access.feeDiscountBps };
});

/**
 * Service-to-service / cron mint of the next sequential epoch.
 *
 * Prefer external cron → this endpoint (or tRPC mintEpoch with admin:treasury)
 * over the in-process auto-tick: a cron is pauseable, inspectable, and does not
 * depend on which replica holds the timer.
 */
app.post('/internal/emissions/mint-next', async (req, reply) => {
  if (verifyServiceHeaders(req.headers, env.INTERNAL_SERVICE_SECRET).service === null) {
    return reply.code(401).send({ error: 'service credentials required', code: 'token.unauthenticated' });
  }
  if (!env.EMISSIONS_ENABLED) {
    return reply.code(503).send({ error: 'emissions are disabled', code: 'token.emissions_disabled' });
  }
  try {
    const result = await token.mintNextEpoch();
    return { epoch: result.epoch, minted: formatAmount(result.minted) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'mint failed';
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : 'token.mint_failed';
    // Fail closed: never 200 on a mint that did not land.
    return reply.code(400).send({ error: message, code });
  }
});

// ── Optional emissions auto-tick ─────────────────────────────────────────────

let minting = false;

async function emissionsTick(): Promise<void> {
  if (!env.EMISSIONS_ENABLED) return;
  if (minting) return;
  minting = true;
  try {
    const result = await token.mintNextEpoch();
    app.log.info({ epoch: result.epoch, minted: formatAmount(result.minted) }, 'emission epoch minted (auto-tick)');
  } catch (err) {
    // Never let a tick failure kill the interval. Closed/exhausted epochs are
    // expected once the schedule ends; log and wait for the next tick.
    app.log.error({ err }, 'emission auto-tick failed');
  } finally {
    minting = false;
  }
}

let emissionsTimer: ReturnType<typeof setInterval> | undefined;
if (env.EMISSIONS_ENABLED && env.EMISSIONS_AUTO_TICK) {
  emissionsTimer = setInterval(() => void emissionsTick(), env.EMISSIONS_TICK_MS);
  emissionsTimer.unref();
  app.log.info({ tickMs: env.EMISSIONS_TICK_MS }, 'emission auto-tick enabled');
}

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<TokenRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info(
  {
    port: env.HTTP_PORT,
    asset: env.TOKEN_ASSET_ID,
    emissionsEnabled: env.EMISSIONS_ENABLED,
    emissionsAutoTick: env.EMISSIONS_AUTO_TICK,
    trpc: true,
  },
  'svc-token ready',
);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      if (emissionsTimer) clearInterval(emissionsTimer);
      await app.close();
      await bus.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
