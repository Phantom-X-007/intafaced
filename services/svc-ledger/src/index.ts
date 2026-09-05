import Fastify from 'fastify';
import postgres from 'postgres';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { ledgerPostgresOptions } from './db/connection-options.js';
import { LedgerService } from './service.js';
import { createLedgerRouter } from './router.js';
import { runScheduledReconciliation } from './ledger/reconcile.js';
import { registerS2sHttp } from './s2s-http.js';
import { registerMetrics } from './metrics.js';
import { registerOperatorHttp } from './operator-http.js';
import { registerLedgerStatusHttp } from './status-http.js';
import { registerProcessHooks, startTelemetry } from '@intafaced/telemetry';

// §9 — register the TracerProvider before the first span is created.
// `@opentelemetry/api` alone is a no-op: without this call every span in
// ./tracing.ts is built, tagged and then discarded before it reaches the
// collector. Tracers grabbed at module scope resolve lazily through the proxy
// provider, so registering here still captures them.
registerProcessHooks(
  startTelemetry({
    serviceName: env.SERVICE_NAME,
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    enabled: env.OTEL_ENABLED,
    environment: env.APP_ENV,
  }),
);

/**
 * svc-ledger — THE BALANCE (§4.2).
 *
 * Graph W1-C: S2S money plane via registerS2sHttp (plain /trpc/* for clients).
 * Network policy must keep these off the public internet until holds + service
 * auth land for real deploy.
 */

const sql = postgres(env.DATABASE_URL, ledgerPostgresOptions(env));

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

/**
 * §14.5 — the book's scrape surface. Not the user SLO (that is svc-edge);
 * this is this process's HTTP latency. Registered before listen so the
 * `onResponse` hook is in place for every reply the process sends.
 *
 * `tooling/infra/prometheus.yaml` scrapes this at `svc-ledger:4001/metrics`.
 * `observability-wiring.test.ts` asserts that host, port and path against the
 * real compose file. `metrics.boot.e2e.test.ts` fails if this call is deleted.
 */
registerMetrics(app, { service: env.SERVICE_NAME });

registerLedgerStatusHttp(app, ledger, env.SERVICE_NAME);

registerS2sHttp(app, ledger, env.INTERNAL_SERVICE_SECRET, { bodyBind: env.INTERNAL_SERVICE_BODY_BIND });

/**
 * §14.6 — the operator surface: freeze, unfreeze, and on-demand reconcile.
 *
 * `appRouter` above is exported for its TYPE and served on no port, so the
 * tRPC procedures alone were callable by nothing. `registerOperatorHttp`
 * mounts GET/POST `/operator/freeze`, POST `/operator/unfreeze`, and
 * POST `/operator/reconcile` behind `admin:treasury` + MFA + distinct confirm.
 * See `operator-http.ts`.
 */
registerOperatorHttp(app, ledger, {
  secret: env.JWT_ACCESS_SECRET,
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
  accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
});

const reconcileTimer = setInterval(() => {
  void (async () => {
    try {
      const { report, snapshotted } = await runScheduledReconciliation(sql, ledger);
      if (!report.ok) {
        app.log.fatal({ report, snapshotted }, 'LEDGER RECONCILIATION FAILED — posting frozen, operator paged');
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
