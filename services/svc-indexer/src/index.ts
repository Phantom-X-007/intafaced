import Fastify from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createDb } from '@intafaced/db';
import { createEdgeContext } from '@intafaced/contracts';
import { checkAccess } from '@intafaced/config';
import { env } from './env.js';
import { NullChainSource } from './chain/memory-source.js';
import { PostgresProjectionStore } from './projection/postgres-store.js';
import { Indexer } from './indexer.js';
import { createIndexerRouter, type IndexerRouter } from './router.js';

/**
 * svc-indexer — chain → Postgres read models for `apps/web` (§17.5).
 *
 * The Protocol Plane keeps its state on chain, not in our ledger. A UI cannot
 * query a chain fast enough to render an order book, so this service follows
 * chain state and projects it into tables the app can query. It is the read
 * path, and only the read path.
 *
 * Three things this boot deliberately does not do:
 *
 *   · it loads no private key. A read model originates no transaction
 *   · it opens no ledger connection. This plane posts nothing — `custody-scan`
 *     asserts it and `sovereignty.test.ts` asserts it again
 *   · it does not invent a chain. `NullChainSource` reports no head, so the
 *     ingest loop has nothing to do, and `status.chainSource` says `'null'` out
 *     loud. See SOCKET §13 `socket.evm-rpc`
 */

const db = createDb({ url: env.DATABASE_URL, schema: 'indexer', max: env.DATABASE_POOL_MAX, ssl: env.DATABASE_SSL }, {});

// The read model must exist before we claim to serve it — a missing table here
// is a missed migration, and it should fail at boot rather than on a user's
// first request.
const [table] = await db.sql<Array<{ exists: boolean }>>`
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'indexer' AND table_name = 'blocks'
  ) AS exists
`;
if (!table?.exists) {
  throw new Error('indexer.blocks is missing — run migrations before starting svc-indexer');
}

const store = new PostgresProjectionStore(db.sql, env.INDEXER_CHAIN_ID);

/**
 * SOCKET §13 — `socket.evm-rpc`.
 *
 * There is no EVM RPC in this stack and no deployed CLOB to read, so the
 * production wiring is a source that reports no chain rather than a fabricated
 * one. The loop, the reorg repair and the projection are all real and all
 * tested against `MemoryChainSource`; what is missing is exactly one adapter,
 * and the port it must implement is `chain/source.ts`.
 */
const source = new NullChainSource(env.INDEXER_CHAIN_ID);

let ingestEnabled = env.INDEXER_INGEST_ENABLED;

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

const indexer = new Indexer({
  source,
  store,
  finalityDepth: env.INDEXER_FINALITY_DEPTH,
  batchSize: env.INDEXER_BATCH_SIZE,
  ingestEnabled: () => ingestEnabled,
  onError: (err, context) => app.log.error({ err, context }, 'indexer sync error'),
});

export const appRouter = createIndexerRouter({
  store,
  indexer,
  chainId: env.INDEXER_CHAIN_ID,
  finalityDepth: env.INDEXER_FINALITY_DEPTH,
  ingestEnabled: () => ingestEnabled,
  chainSource: 'null',
});
export type AppRouter = typeof appRouter;

// Built before the listener opens: a service that cannot authenticate the edge
// must fail to start, not start and serve every request as anonymous
// (docs/decisions/mount-boundary.md).
const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

app.get('/health', async () => ({
  ok: true,
  service: env.SERVICE_NAME,
  chainId: env.INDEXER_CHAIN_ID,
  custodial: false,
  ingestEnabled,
}));

/**
 * Readiness is about whether this projection trusts itself.
 *
 * A halted indexer has hit a reorg deeper than its retained history: it knows
 * its book is wrong and cannot repair it. Leaving the rotation is the correct
 * response — a stale book is a bad experience, a confidently wrong book is the
 * failure this service exists to prevent. Being unreachable costs a user
 * nothing they cannot get from any node; a wrong price costs them a trade.
 *
 * A database that will not answer is the other way out of the rotation, for the
 * ordinary reason.
 */
app.get('/ready', async (_req, reply) => {
  const halted = indexer.halted;
  if (halted) {
    return reply.code(503).send({ ready: false, reason: halted.reason, haltedAt: halted.at.toISOString() });
  }
  try {
    await db.sql`SELECT 1`;
    return { ready: true };
  } catch (err) {
    return reply.code(503).send({ ready: false, reason: (err as Error).message });
  }
});

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
    onError({ path, error }) {
      app.log.error({ path, err: error }, 'trpc error');
    },
  } satisfies FastifyTRPCPluginOptions<IndexerRouter>['trpcOptions'],
});

/**
 * §22, asserted at boot rather than assumed.
 *
 * If a future edit ever makes this module custodial, or moves it off the
 * protocol plane, the service refuses to start instead of quietly beginning to
 * gate users who were promised they would never be gated.
 */
const sovereignty = checkAccess({ module: 'indexer', plane: 'protocol', region: 'XX', kycTier: 'none' });
if (sovereignty.code !== 'allowed.permissionless') {
  throw new Error(
    `THE SOVEREIGNTY LAW IS BROKEN (§22): checkAccess for module "indexer" on the protocol plane ` +
      `returned "${sovereignty.code}", not "allowed.permissionless". Refusing to start.`,
  );
}

indexer.start(env.INDEXER_POLL_INTERVAL_MS);

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info(
  { port: env.HTTP_PORT, chainId: env.INDEXER_CHAIN_ID, chainSource: 'null', finalityDepth: env.INDEXER_FINALITY_DEPTH },
  'svc-indexer ready — non-custodial, permissionless, read-only',
);

/** The kill-switch surface `apps/admin` reaches (§14 admin controls). */
export function setIngestEnabled(next: boolean): void {
  ingestEnabled = next;
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      indexer.stop();
      await app.close();
      await db.close();
      process.exit(0);
    })();
  });
}
