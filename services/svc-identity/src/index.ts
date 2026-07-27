import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { AuthService } from './auth/auth-service.js';
import { RankService } from './rank/rank-service.js';
import { assertArgon2Available, argon2Available } from './auth/passwords.js';
import { createIdentityRouter, type IdentityRouter } from './router.js';

/**
 * svc-identity — one account, one verification, one rank (§4.1).
 *
 * Graph W1-C: mount tRPC like svc-agents. Edge terminates auth and forwards
 * `x-intafaced-principal`; this process never parses a user JWT for router calls.
 */

if (env.APP_ENV === 'prod') await assertArgon2Available();

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'identity,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM identity.users LIMIT 1`.catch(() => {
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

const auth = new AuthService(sql, bus, rank, {
  secret: env.JWT_ACCESS_SECRET,
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
  accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
  refreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
});

export const appRouter = createIdentityRouter(auth, rank, { registrationOpen: env.REGISTRATION_OPEN });
export type AppRouter = typeof appRouter;

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({ ready: true, argon2: await argon2Available() }));

/**
 * Service-to-service rank perks (svc-trade reads at order accept).
 * Plain GET keeps the existing client contract and fails closed if the ladder
 * cannot be loaded — see createRankPerksClient in svc-trade.
 */
app.get<{ Params: { userId: string } }>('/internal/rank/:userId/perks', async (req) => {
  return rank.perks(req.params.userId);
});

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => ({
      principal: (req.headers['x-intafaced-principal']
        ? JSON.parse(String(req.headers['x-intafaced-principal']))
        : null) as never,
      region: String(req.headers['x-intafaced-region'] ?? 'XX'),
      requestId: String(req.id),
      ...(req.headers.traceparent ? { traceparent: String(req.headers.traceparent) } : {}),
    }),
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
      await bus.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
