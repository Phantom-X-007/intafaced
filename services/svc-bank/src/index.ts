import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { env } from './env.js';
import { createBankServices } from './bank-service.js';
import { createLedgerClient, createLedgerHistory } from './ledger-client.js';
import { createBankRouter, type BankRouter } from './router.js';
import { withSpan } from './tracing.js';
import { verifyServiceHeaders } from '@intafaced/contracts';

/**
 * svc-bank — multi-currency accounts over the ledger (§8.1).
 *
 * Boot order: env → db → ledger → services → server. There is no bus
 * connection: this service publishes no NATS subject in this PR, because
 * declaring one is a `packages/events` PR that AGENT_PROTOCOL §1 requires to
 * land first. The planned subjects are listed in the README.
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'bank,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM bank.spaces LIMIT 1`.catch(() => {
  throw new Error('bank schema is missing — run migrations before starting svc-bank');
});

// Value moves through svc-ledger, never through this service's own tables
// (Doctrine §0.6). This client is the only path.
const ledger = createLedgerClient(env.LEDGER_URL, env.INTERNAL_SERVICE_SECRET);
const history = createLedgerHistory(env.LEDGER_URL, env.INTERNAL_SERVICE_SECRET);

const bank = createBankServices(sql, ledger, history, { nativeAssetId: env.TOKEN_ASSET_ID });

export const appRouter = createBankRouter(bank);
export type AppRouter = typeof appRouter;

// Built before the listener opens: a service that cannot authenticate the edge
// must fail to start, not start and serve every request as anonymous.
const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({
  ready: true,
  scheduledTransfers: env.SCHEDULED_TRANSFERS_ENABLED,
  interestAccrual: env.INTEREST_ACCRUAL_ENABLED,
}));

/**
 * Service credentials on the job endpoints (§2).
 *
 * These two routes are the ONLY surface svc-bank serves — the tRPC router with
 * its 17 scoped procedures is built and never mounted. So the entire reachable
 * attack surface of this service was two unauthenticated POSTs that initiate
 * ledger posts on other people's accounts.
 *
 * Idempotency and the due-date check mean an attacker could not double-pay or
 * pull a transfer forward, so this is not theft. It is an unauthenticated
 * trigger for money movement and unbounded database work, which is enough.
 *
 * Third instance of this shape today, after `ledger.post` (#50) and
 * svc-matching's order writes (#55): a guard written on the tRPC layer while
 * the raw route beside it served the same capability unguarded.
 */
function requireService(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  return verifyServiceHeaders(req.headers, env.INTERNAL_SERVICE_SECRET).service !== null;
}

/**
 * The standing-order runner.
 *
 * Exposed as an endpoint rather than an internal timer so the scheduler is
 * external and observable: a cron that can be paused, inspected, and re-run by
 * an operator, instead of a `setInterval` inside a replica that nobody can see
 * and every replica duplicates. Duplication is safe here — that is the whole
 * point of the idempotency work — but "safe when it happens" is not a reason to
 * make it happen on every deploy.
 */
app.post('/internal/jobs/run-due-transfers', async (req, reply) => {
  // 401 before the flag check: an unauthenticated caller must not be able to
  // learn which jobs are enabled by reading the difference between 401 and 503.
  if (!requireService(req)) {
    return reply.code(401).send({ error: 'service credentials required', code: 'bank.unauthenticated' });
  }
  if (!env.SCHEDULED_TRANSFERS_ENABLED) {
    return reply.code(503).send({ error: 'scheduled transfers are disabled', code: 'bank.transfers_disabled' });
  }
  return withSpan('bank.job.runDueTransfers', async () => bank.transfers.runDueTransfers({ limit: env.TRANSFER_BATCH_SIZE }));
});

app.post('/internal/jobs/accrue-interest', async (req, reply) => {
  if (!requireService(req)) {
    return reply.code(401).send({ error: 'service credentials required', code: 'bank.unauthenticated' });
  }
  if (!env.INTEREST_ACCRUAL_ENABLED) {
    return reply.code(503).send({ error: 'interest accrual is disabled', code: 'bank.accrual_disabled' });
  }
  return withSpan('bank.job.accrueInterest', async () => {
    const results = await bank.earn.accrueAll();
    return results.map((r) => ({ poolId: r.poolId, date: r.date, recipients: r.recipients, alreadyAccrued: r.alreadyAccrued }));
  });
});

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    // The edge terminates auth and forwards the resolved principal; this
    // service never parses a token itself (§4.1 owns that). It does verify the
    // edge's signature over that principal — see packages/contracts/src/edge.ts
    // for why an unsigned header makes every scope check decorative.
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<BankRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info(
  {
    port: env.HTTP_PORT,
    scheduledTransfers: env.SCHEDULED_TRANSFERS_ENABLED,
    interestAccrual: env.INTEREST_ACCRUAL_ENABLED,
  },
  'svc-bank ready',
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
