import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext, verifyServiceHeaders } from '@intafaced/contracts';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { AuthService } from './auth/auth-service.js';
import { RankService } from './rank/rank-service.js';
import { ReferralService } from './affiliates/referral-service.js';
import { FreezeService } from './affiliates/freeze-service.js';
import { SqlAccrualStore } from './affiliates/accrual-store.js';
import { parseAccrualTierLawJson } from './affiliates/commission-rate-law.js';
import { assertArgon2Available, argon2Available } from './auth/passwords.js';
import { createIdentityRouter, type IdentityRouter } from './router.js';
import { subscribeBlueprintProfileEvents, subscribeXpEvents } from './events.js';
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
 * svc-identity — one account, one verification, one rank (§4.1).
 *
 * Graph W1-C: mount tRPC; verify edge-signed principal (mount-boundary #48).
 * Blueprint cascade: subscribe to blueprintCreated/Deleted so profiles.blueprint_id
 * tracks svc-blueprint without writing across service tables (§2 / §7.2).
 * XP: subscribe to xpEarned, so awards published by svc-p2p and svc-trade reach
 * rank_state. Until this consumer existed they reached nothing — see ./events.ts.
 */

if (env.APP_ENV === 'prod') await assertArgon2Available();

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'identity,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM users LIMIT 1`.catch(() => {
  throw new Error('identity schema is missing — run migrations before starting svc-identity');
});

const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  ownedStreams: ['identity'],
});

const rank = new RankService(sql, bus);
await rank.seedTiers();

/** §7.2 cascade — must be wired before traffic; durable consumers catch up on restart. */
const blueprintSubs = await subscribeBlueprintProfileEvents(bus, sql);

/**
 * XP from every other module. Wired here rather than inside `RankService`
 * because the service is also called directly by our own auth flows and by
 * `awardXp` over tRPC — the bus is a fourth caller of the same method, not a
 * different way of writing rank_state.
 *
 * `identity` is our own stream, so this cannot fail on a stream that does not
 * exist yet; svc-p2p and svc-trade publish into it.
 */
const xpSub = await subscribeXpEvents(bus, rank);

const auth = new AuthService(
  sql,
  bus,
  rank,
  {
    secret: env.JWT_ACCESS_SECRET,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    refreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
  },
  {
    rpID: env.WEBAUTHN_RP_ID,
    rpName: env.WEBAUTHN_RP_NAME,
    origin: env.WEBAUTHN_ORIGIN.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
);

const referral = new ReferralService(sql);
const freeze = new FreezeService(sql);
const accruals = new SqlAccrualStore(sql);
/** Fail boot on malformed owner rates — never invent commission percentages. */
const accrualTierLaw = parseAccrualTierLawJson(env.IDENTITY_AFFILIATE_ACCRUAL_TIERS_JSON);

export const appRouter = createIdentityRouter(auth, rank, {
  registrationOpen: env.REGISTRATION_OPEN,
  webauthnEnabled: env.WEBAUTHN_ENABLED,
  referral,
  freeze,
  accruals,
  accrualTierLaw,
});
export type AppRouter = typeof appRouter;

const edgeContext = createEdgeContext({
  secret: env.EDGE_PRINCIPAL_SECRET,
  serviceName: env.SERVICE_NAME,
  internalSecret: env.INTERNAL_SERVICE_SECRET,
});

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({ ready: true, argon2: await argon2Available() }));

/**
 * Service-to-service rank perks (svc-trade reads at order accept).
 * Authenticated by the shared service secret — same control as bank jobs (#62).
 * Previously unauthenticated (full audit L2-3).
 */
app.get<{ Params: { userId: string } }>('/internal/rank/:userId/perks', async (req, reply) => {
  if (verifyServiceHeaders(req.headers, env.INTERNAL_SERVICE_SECRET).service === null) {
    return reply.code(401).send({ error: 'service credentials required', code: 'identity.unauthenticated' });
  }
  return rank.perks(req.params.userId);
});

/**
 * Service-to-service sub-account ownership (svc-trade placeOrder gate).
 * Fail-closed at the caller: missing credentials → 401; unknown id → 404.
 * Body is the published `subAccountOwnershipSchema` contract.
 */
app.get<{ Params: { subAccountId: string } }>('/internal/sub-accounts/:subAccountId', async (req, reply) => {
  if (verifyServiceHeaders(req.headers, env.INTERNAL_SERVICE_SECRET).service === null) {
    return reply.code(401).send({ error: 'service credentials required', code: 'identity.unauthenticated' });
  }
  const row = await auth.getSubAccountOwnership(req.params.subAccountId);
  if (!row) {
    return reply.code(404).send({ error: 'sub-account not found', code: 'identity.sub_account_not_found' });
  }
  return row;
});

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<IdentityRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info(
  { port: env.HTTP_PORT, argon2: await argon2Available(), registrationOpen: env.REGISTRATION_OPEN, trpc: true },
  'svc-identity ready',
);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      await Promise.all([...blueprintSubs, xpSub].map((s) => s.unsubscribe()));
      await bus.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
