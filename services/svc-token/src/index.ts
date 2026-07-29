import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext, verifyServiceHeaders } from '@intafaced/contracts';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { TokenService } from './token-service.js';
import { DEFAULT_EMISSION_PARAMS } from './economics/emission.js';
import { DEFAULT_BUYBACK_PARAMS } from './economics/buyback.js';
import { createLedgerClient } from './ledger-client.js';
import { createTokenRouter, type TokenRouter } from './router.js';

/**
 * svc-token — the native economy (§4.3).
 *
 * Graph W1-C: mount tRPC with edge-signed principal; keep /internal/stake for S2S.
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
  emission: DEFAULT_EMISSION_PARAMS,
  buyback: DEFAULT_BUYBACK_PARAMS,
});

export const appRouter = createTokenRouter(token);
export type AppRouter = typeof appRouter;

const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({ ready: true, emissionsEnabled: env.EMISSIONS_ENABLED }));

app.get<{ Params: { userId: string } }>('/internal/stake/:userId', async (req, reply) => {
  if (verifyServiceHeaders(req.headers, env.INTERNAL_SERVICE_SECRET).service === null) {
    return reply.code(401).send({ error: 'service credentials required', code: 'token.unauthenticated' });
  }
  const access = await token.accessOf(req.params.userId);
  return { staked: access.staked.toString(), tier: access.tier, feeDiscountBps: access.feeDiscountBps };
});

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<TokenRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT, asset: env.TOKEN_ASSET_ID, emissionsEnabled: env.EMISSIONS_ENABLED, trpc: true }, 'svc-token ready');

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
