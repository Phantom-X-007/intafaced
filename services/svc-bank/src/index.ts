import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { createBankServices } from './bank-service.js';
import { eventMarginCallSink } from './loans/margin-call-publisher.js';
import { tickerPriceSource } from './loans/prices.js';
import { createLedgerClient, createLedgerHistory } from './ledger-client.js';
import { createBankRouter, type BankRouter } from './router.js';
import { withSpan } from './tracing.js';
import { verifyServiceHeaders } from '@intafaced/contracts';

/**
 * svc-bank — multi-currency accounts over the ledger (§8.1).
 *
 * Boot order: env → db → ledger → bus → services → server.
 *
 * The bus connection is new, and it exists for one subject. `bankMarginCalled`
 * had a complete svc-notify consumer and no publisher anywhere, so a margin call
 * started a grace clock that gates liquidation and the borrower was never told —
 * the outcome `loans/risk.ts` argues against at length. `ownedStreams: ['bank']`
 * is what creates `INTAFACED_BANK`, which has never existed, and until it does
 * the consumer on the other side cannot attach at all.
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

/**
 * `ownedStreams: ['bank']` — this process is responsible for creating
 * `INTAFACED_BANK`. It carries no money: the only subject on it announces that a
 * call was RAISED, and value continues to move through svc-ledger and nowhere
 * else (§0.6). Publishing is not a value movement.
 */
const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  ownedStreams: ['bank'],
});

const bank = createBankServices(sql, ledger, history, {
  nativeAssetId: env.TOKEN_ASSET_ID,
  loans: {
    // Marks are READ from svc-trade's public REST. svc-trade belongs to another
    // stream; nothing here imports it, shares a table with it, or writes to it.
    // What loans actually need from it — an index price rather than a last
    // trade, a depth read, and eventually collateral-funded orders — is written
    // out in `loans/prices.ts` rather than assumed to exist.
    priceSource: tickerPriceSource({ baseUrl: env.TRADE_URL }),
    // The half that was missing. Without this the risk sweep raises calls into
    // a database column and svc-notify's finished consumer never sees one.
    marginCalls: eventMarginCallSink(bus),
  },
});

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
  loanAccrual: env.LOAN_ACCRUAL_ENABLED,
  // Surfaced because "are we liquidating today" is the first question anyone
  // asks about this service, and it should not require reading an env file.
  loanRiskSweep: env.LOAN_RISK_SWEEP_ENABLED,
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

/**
 * LOAN INTEREST ACCRUAL (§8.1 "interest accrual daily recipe").
 *
 * Its own endpoint and its own flag rather than a branch inside the earn job,
 * because the two move money in opposite directions: earn accrual PAYS users out
 * of a funded reserve, loan accrual CHARGES borrowers. An operator halting a
 * runaway payout should not thereby stop charging every borrower on the book.
 *
 * This job posts NOTHING to the ledger. Loan interest capitalises — the day's
 * charge increases the debt and moves no value — so a re-run is guarded by
 * `unique(loan_id, accrual_date)` rather than by an idempotency key, and each day
 * is charged exactly once however many times this fires.
 */
app.post('/internal/jobs/accrue-loan-interest', async (req, reply) => {
  if (!requireService(req)) {
    return reply.code(401).send({ error: 'service credentials required', code: 'bank.unauthenticated' });
  }
  if (!env.LOAN_ACCRUAL_ENABLED) {
    return reply.code(503).send({ error: 'loan interest accrual is disabled', code: 'bank.loan_accrual_disabled' });
  }
  return withSpan('bank.job.accrueLoanInterest', async () => {
    const results = await bank.loans.accrueAll();
    return results.map((r) => ({ loanId: r.loanId, days: r.days }));
  });
});

/**
 * THE RISK SWEEP — mark every open loan, call what needs calling, liquidate what
 * has been called and has run out of grace.
 *
 * Defaults to DISABLED (`LOAN_RISK_SWEEP_ENABLED`), unlike every other job here.
 * The others move a user's own money between the user's own accounts, or pay out
 * yield that was funded first. This one sells people's collateral, and a fresh
 * deployment whose price source, thresholds and liquidation venue have not been
 * checked by a human must not start doing that on its own.
 */
app.post('/internal/jobs/run-risk-sweep', async (req, reply) => {
  if (!requireService(req)) {
    return reply.code(401).send({ error: 'service credentials required', code: 'bank.unauthenticated' });
  }
  if (!env.LOAN_RISK_SWEEP_ENABLED) {
    return reply.code(503).send({ error: 'the loan risk sweep is disabled', code: 'bank.risk_sweep_disabled' });
  }
  return withSpan('bank.job.runRiskSweep', async () => bank.loans.runRiskSweep({ limit: env.LOAN_SWEEP_BATCH_SIZE }));
});

/**
 * Re-drive loans stuck between the collateral lock and the principal draw.
 *
 * The recovery half of the crash story. Both posts are idempotent on business
 * keys, so this is safe to run at any time and any number of times: a loan whose
 * collateral was locked before the crash does not lock it twice, and one whose
 * draw landed does not draw twice.
 */
app.post('/internal/jobs/resume-pending-loans', async (req, reply) => {
  if (!requireService(req)) {
    return reply.code(401).send({ error: 'service credentials required', code: 'bank.unauthenticated' });
  }
  return withSpan('bank.job.resumePendingLoans', async () => bank.loans.resumePending());
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
      await bus.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
