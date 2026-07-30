import Fastify from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createDb } from '@intafaced/db';
import { createEdgeContext } from '@intafaced/contracts';
import { checkAccess } from '@intafaced/config';
import { env } from './env.js';
import { NullChainSource } from './chain/memory-source.js';
import { EvmChainSource } from './chain/evm/source.js';
import { PostgresProjectionStore } from './projection/postgres-store.js';
import { Indexer } from './indexer.js';
import { createIndexerRouter, type ChainProbe, type IndexerRouter } from './router.js';

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
 *   · it does not invent a chain. With `INDEXER_RPC_URL` unset, `NullChainSource`
 *     reports no head, the ingest loop has nothing to do, and `status` says
 *     `chainSource: 'null'` out loud rather than serving an empty book as a quiet
 *     market
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
 * THE CHAIN, OR THE HONEST ABSENCE OF ONE.
 *
 * `INDEXER_RPC_URL` decides, and there are exactly two outcomes:
 *
 *   · set   → the real `EvmChainSource`. SOCKET §13 `socket.evm-rpc` is closed:
 *             real blocks, real hashes, real logs pulled by block hash, real
 *             reorg detection. What remains open is `socket.clob-contracts` —
 *             no audited venue emits the ABI in `chain/evm/abi.ts` yet, and
 *             `contracts/dev/DevVenue.sol` is a test fixture that says so
 *   · unset → `NullChainSource`, which reports no head. The ingest loop has
 *             nothing to do, `status.chainSource` is `'null'`, and every read
 *             keeps serving whatever is already projected
 *
 * There is deliberately no third state. A default RPC URL would mean a machine
 * where something else happens to listen on 8545 starts following a chain
 * nobody chose, and `EvmChainSource` refuses a zero venue address for the same
 * reason: `eth_getLogs` against `0x0` returns `[]` rather than failing, which is
 * an empty book nobody would ever question.
 */
const evmSource = env.INDEXER_RPC_URL
  ? new EvmChainSource({
      chainId: env.INDEXER_CHAIN_ID,
      rpcUrl: env.INDEXER_RPC_URL,
      venue: env.INDEXER_VENUE_ADDRESS as `0x${string}`,
    })
  : null;
const source = evmSource ?? new NullChainSource(env.INDEXER_CHAIN_ID);
const chainSource = evmSource ? 'evm' : 'null';

/**
 * The live staleness probe behind `status.chain`.
 *
 * With no chain configured this still answers — it reports `kind: 'null'` and
 * says why in `reason`. "We were never given a chain" and "the chain is down"
 * are different facts and a surface that renders them identically is one that
 * will eventually render a stale book as a current one.
 */
const chainProbe: () => Promise<ChainProbe> = evmSource
  ? () => evmSource.probe()
  : async () => ({
      kind: 'null',
      rpcUrl: null,
      venue: null,
      reachable: false,
      observedChainId: null,
      chainHeight: null,
      venueDeployed: false,
      refusalCode: 'indexer.chain_not_configured',
      reason:
        'INDEXER_RPC_URL is not set, so this service is following no chain. Everything it serves is whatever ' +
        'was projected before, and nothing is advancing it. (SOCKET §13 socket.evm-rpc)',
    });

let ingestEnabled = env.INDEXER_INGEST_ENABLED;

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

const indexer = new Indexer({
  source,
  store,
  finalityDepth: env.INDEXER_FINALITY_DEPTH,
  batchSize: env.INDEXER_BATCH_SIZE,
  startHeight: env.INDEXER_START_HEIGHT,
  ingestEnabled: () => ingestEnabled,
  onError: (err, context) => app.log.error({ err, context }, 'indexer sync error'),
});

export const appRouter = createIndexerRouter({
  store,
  indexer,
  chainId: env.INDEXER_CHAIN_ID,
  finalityDepth: env.INDEXER_FINALITY_DEPTH,
  ingestEnabled: () => ingestEnabled,
  chainSource,
  chainProbe,
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

/**
 * A boot-time chain check that LOGS rather than throws.
 *
 * Deliberate. A read model whose chain is not up yet still has a job — it serves
 * everything already projected, and `status` now states exactly how stale that
 * is. Refusing to start would take the read path down over a dependency the read
 * path does not need, and in a compose stack it would mean svc-indexer racing
 * `evm` and losing.
 *
 * What must never happen is starting quietly. So the refusal is logged at
 * `error` with its code, `status.chain` carries the same refusal on every
 * request, and `Indexer.lastError` records each pass that cannot advance.
 */
if (evmSource) {
  const probe = await chainProbe();
  if (probe.reachable && probe.venueDeployed) {
    app.log.info({ ...probe }, 'chain reachable, venue deployed — projecting');
  } else {
    app.log.error({ ...probe }, 'chain not usable at boot — the projection cannot advance until this clears');
  }
}

indexer.start(env.INDEXER_POLL_INTERVAL_MS);

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info(
  {
    port: env.HTTP_PORT,
    chainId: env.INDEXER_CHAIN_ID,
    chainSource,
    rpcUrl: env.INDEXER_RPC_URL || null,
    venue: evmSource ? env.INDEXER_VENUE_ADDRESS : null,
    startHeight: env.INDEXER_START_HEIGHT,
    finalityDepth: env.INDEXER_FINALITY_DEPTH,
  },
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
