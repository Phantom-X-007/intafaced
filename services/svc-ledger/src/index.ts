import Fastify from 'fastify';
import postgres from 'postgres';
import { JetStreamEventBus } from '@intafaced/events';
import {
  formatAmount,
  parseAmount,
  accountRefSchema,
  postRequestSchema,
  InsufficientFundsError,
  LedgerError,
  UnbalancedTransactionError,
  InvalidEntryError,
  type EntryInput,
} from '@intafaced/ledger-client';
import { z } from 'zod';
import { env } from './env.js';
import { LedgerService } from './service.js';
import { createLedgerRouter } from './router.js';
import { writeSnapshots } from './ledger/reconcile.js';

/**
 * svc-ledger — THE BALANCE (§4.2).
 *
 * Graph W1-C: expose the money API plane used by other services.
 *
 * Service ledger-clients already POST raw JSON to `/trpc/post|balance|balances`
 * (not the tRPC wire envelope). We honour that contract here. The typed
 * `appRouter` remains exported for tests and a future principal-aware edge.
 *
 * Network policy must keep these endpoints off the public internet until
 * purpose-keyed holds (Denon) and service auth land. Do not treat mount as deploy.
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'ledger,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

const [tip] = await sql<Array<{ seq: string }>>`SELECT seq FROM chain_tip WHERE id = true`;
if (!tip) throw new Error('chain_tip is missing — run migrations before starting svc-ledger');

const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  ownedStreams: ['ledger'],
});

const ledger = new LedgerService(sql, bus, { postingEnabled: env.LEDGER_POSTING_ENABLED });
export const appRouter = createLedgerRouter(ledger);
export type AppRouter = typeof appRouter;

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME, ...ledger.status() }));

app.get('/ready', async (_req, reply) => {
  const status = ledger.status();
  if (!status.postingEnabled) return reply.code(503).send({ ready: false, reason: status.frozenReason });
  return { ready: true };
});

function httpError(err: unknown): { status: number; body: { message: string } } {
  if (err instanceof InsufficientFundsError) return { status: 400, body: { message: err.message } };
  if (err instanceof UnbalancedTransactionError || err instanceof InvalidEntryError) {
    return { status: 500, body: { message: err.message } };
  }
  if (err instanceof LedgerError && err.code === 'ledger.frozen') {
    return { status: 412, body: { message: err.message } };
  }
  if (err instanceof LedgerError) return { status: 500, body: { message: err.message } };
  if (err instanceof z.ZodError) return { status: 400, body: { message: err.message } };
  return { status: 500, body: { message: 'Ledger request failed' } };
}

app.post('/trpc/post', async (req, reply) => {
  try {
    const input = postRequestSchema.parse(req.body);
    const entries: EntryInput[] = input.entries.map((e) => ({
      account: e.account,
      direction: e.direction,
      amount: parseAmount(e.amount),
    }));
    const tx = await ledger.post({
      idempotencyKey: input.idempotencyKey,
      module: input.module,
      reason: input.reason,
      entries,
      ...(input.meta ? { meta: input.meta } : {}),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    });
    return { txId: tx.id, hash: tx.hash, postedAt: tx.postedAt.toISOString() };
  } catch (err) {
    const { status, body } = httpError(err);
    return reply.code(status).send(body);
  }
});

app.post('/trpc/balance', async (req, reply) => {
  try {
    const input = accountRefSchema.parse(req.body);
    const balance = await ledger.balance(input);
    return {
      accountId: balance.accountId,
      assetId: input.assetId,
      kind: input.kind,
      amount: formatAmount(balance.amount),
    };
  } catch (err) {
    const { status, body } = httpError(err);
    return reply.code(status).send(body);
  }
});

const balancesInput = z.object({
  ownerType: z.enum(['user', 'subaccount', 'module', 'house', 'treasury']),
  ownerId: z.string(),
});

app.post('/trpc/balances', async (req, reply) => {
  try {
    const input = balancesInput.parse(req.body);
    const balances = await ledger.balances(input.ownerType, input.ownerId);
    return balances.map((b) => ({
      accountId: b.accountId,
      assetId: b.account.assetId,
      kind: b.account.kind,
      amount: formatAmount(b.amount),
    }));
  } catch (err) {
    const { status, body } = httpError(err);
    return reply.code(status).send(body);
  }
});

const reconcileTimer = setInterval(() => {
  void (async () => {
    try {
      await writeSnapshots(sql);
      const report = await ledger.reconcile();
      if (!report.ok) {
        app.log.fatal({ report }, 'LEDGER RECONCILIATION FAILED — posting frozen, operator paged');
      }
    } catch (err) {
      app.log.error({ err }, 'reconciliation run failed');
    }
  })();
}, env.RECONCILE_CRON_MINUTES * 60_000);
reconcileTimer.unref();

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT, chainSeq: tip.seq, s2sTrpcPaths: true }, 'svc-ledger ready');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      clearInterval(reconcileTimer);
      await app.close();
      await bus.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
