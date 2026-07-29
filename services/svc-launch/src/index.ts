import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { parseAmount } from '@intafaced/ledger-client';
import { env } from './env.js';
import { createLedgerClient } from './ledger-client.js';
import { createStakeSource } from './stake-source.js';
import { LaunchService } from './launch-service.js';
import { createLaunchRouter, type LaunchRouter } from './router.js';

/**
 * svc-launch — the launchpad (§8.4).
 *
 * Phase 5. Raises are escrowed sales settled entirely through svc-ledger: this
 * process holds no balance, mints nothing, and has no code path that could
 * (Doctrine §0.6).
 *
 * No NATS connection: this service publishes no subject and consumes none. A
 * raise's facts are queried under the caller's own authority, and adding a bus
 * dependency for events nothing subscribes to would be a boot-order risk bought
 * for nothing.
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'launch,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM launch.raises LIMIT 1`.catch(() => {
  throw new Error('launch schema is missing — run migrations before starting svc-launch');
});

const ledger = createLedgerClient(env.LEDGER_URL, env.INTERNAL_SERVICE_SECRET);
const stakes = createStakeSource(env.TOKEN_URL, env.INTERNAL_SERVICE_SECRET);

const launch = new LaunchService(sql, ledger, stakes, {
  minContribution: parseAmount(env.LAUNCH_MIN_CONTRIBUTION),
  settleBatchSize: env.LAUNCH_SETTLE_BATCH_SIZE,
});

export const appRouter = createLaunchRouter(launch);
export type AppRouter = typeof appRouter;

// Built before the listener opens: a service that cannot authenticate the edge
// must fail to start, not start and serve every request as anonymous.
const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));

/**
 * Readiness names the two services a raise cannot run without, and it reports
 * them rather than probing them.
 *
 * A probe here would turn a transient blip in svc-token into a rolling restart
 * of svc-launch, and there is nothing this process could do about it anyway —
 * the stake gate and the ledger already fail closed at the moment they are
 * used, which is the moment that matters.
 */
app.get('/ready', async () => ({
  ready: true,
  ledgerUrl: env.LEDGER_URL,
  stakeGate: env.TOKEN_URL,
}));

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    // The edge terminates auth and forwards the resolved principal; this
    // service never parses a token itself (§4.1 owns that). It does verify the
    // edge's signature over that principal — see packages/contracts/src/edge.ts
    // for why an unsigned header makes every scope check decorative.
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<LaunchRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT, settleBatchSize: env.LAUNCH_SETTLE_BATCH_SIZE, trpc: true }, 'svc-launch ready');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
