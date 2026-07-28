import Fastify from 'fastify';
import postgres from 'postgres';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { LedgerService } from './service.js';
import { createLedgerRouter } from './router.js';
import { writeSnapshots } from './ledger/reconcile.js';
import { registerS2sHttp } from './s2s-http.js';

/**
 * svc-ledger — THE BALANCE (§4.2).
 *
 * Graph W1-C: S2S money plane via registerS2sHttp (plain /trpc/* for clients).
 * Network policy must keep these off the public internet until holds + service
 * auth land for real deploy.
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

// Before the first request, never after: a frozen database stays frozen, and
// LEDGER_POSTING_ENABLED=false becomes a durable freeze that also reaches the
// replicas nobody reconfigured. See LedgerService.applyStartupPolicy — the
// flag can freeze, and can never thaw.
const freezeAtBoot = await ledger.applyStartupPolicy();

export const appRouter = createLedgerRouter(ledger);
export type AppRouter = typeof appRouter;

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME, ...(await ledger.status()) }));

app.get('/ready', async (_req, reply) => {
  const status = await ledger.status();
  if (!status.postingEnabled) return reply.code(503).send({ ready: false, reason: status.frozenReason });
  return { ready: true };
});

registerS2sHttp(app, ledger, env.INTERNAL_SERVICE_SECRET);

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
app.log.info(
  { port: env.HTTP_PORT, chainSeq: tip.seq, s2sTrpcPaths: true, frozen: freezeAtBoot.frozen, frozenBy: freezeAtBoot.actor },
  'svc-ledger ready',
);

// Loud, at the top level, because a process that came up frozen looks identical
// to a healthy one in every graph except the one nobody is watching.
if (freezeAtBoot.frozen) {
  app.log.fatal({ reason: freezeAtBoot.reason, actor: freezeAtBoot.actor }, 'LEDGER POSTING IS FROZEN — no value can move');
}

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
