import Fastify from 'fastify';
import postgres from 'postgres';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { LedgerService } from './service.js';
import { createLedgerRouter } from './router.js';
import { writeSnapshots } from './ledger/reconcile.js';

/**
 * svc-ledger — THE BALANCE (§4.2).
 *
 * Boot order matters: database, then bus, then the service, then the server.
 * Nothing accepts a request until every dependency it needs is proven up.
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'ledger,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

// Prove the book is reachable and initialised before serving anything.
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

const app = Fastify({ logger: { level: env.LOG_LEVEL } });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME, ...ledger.status() }));

/**
 * Readiness is stricter than liveness: a frozen ledger is alive but must not
 * receive traffic, so the load balancer takes it out of rotation rather than
 * sending posts that will only be refused.
 */
app.get('/ready', async (_req, reply) => {
  const status = ledger.status();
  if (!status.postingEnabled) return reply.code(503).send({ ready: false, reason: status.frozenReason });
  return { ready: true };
});

// §4.2 — hourly snapshots, and a reconciliation pass to catch drift early.
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
app.log.info({ port: env.HTTP_PORT, chainSeq: tip.seq }, 'svc-ledger ready');

// Drain rather than drop: an in-flight post finishes before the process exits.
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
