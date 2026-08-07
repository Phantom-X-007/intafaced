import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext, verifyServiceHeaders } from '@intafaced/contracts';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { P2pService } from './p2p-service.js';
import { InstrumentService } from './instrument-service.js';
import { createLedgerClient } from './ledger-client.js';
import { createP2pRouter, type P2pRouter } from './router.js';
import { parseModeratorUserIds } from './moderation-auth.js';
import { P2pErasure } from './erasure.js';
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
 * svc-p2p — peer-to-peer trading with escrow (§6.2).
 *
 * Two things start here that are not optional, and both are the same promise
 * from different ends:
 *
 *   · the TIMEOUT sweep, which resolves any trade whose deadline has passed;
 *   · the SETTLEMENT sweep, which posts any resolution that was decided but
 *     not yet acted on.
 *
 * Between them, no trade can sit in escrow indefinitely and no decision can go
 * unexecuted. If this process does not run the sweeps, escrow eventually
 * strands — so they are started before the HTTP listener, not after.
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'p2p,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM p2p.p2p_trades LIMIT 1`.catch(() => {
  throw new Error('p2p schema is missing — run migrations before starting svc-p2p');
});

const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  ownedStreams: ['p2p'],
});

// Escrowed value lives in svc-ledger's `escrow` accounts, never in this
// service's tables (Doctrine §0.6). This client is the only path.
const ledger = createLedgerClient(env.LEDGER_URL, env.INTERNAL_SERVICE_SECRET);

// Where the buyer is told to send the fiat, and the record of who ever looked.
// Constructed before P2pService because a P2pService without one would lock
// escrow against a payment nobody could make.
const instruments = new InstrumentService(sql, { retentionDays: env.P2P_INSTRUMENT_RETENTION_DAYS });

const p2p = new P2pService(sql, ledger, bus, {
  instruments,
  feeBps: env.P2P_FEE_BPS,
  tradingEnabled: env.P2P_TRADING_ENABLED,
  deadlines: {
    escrowSeconds: env.P2P_ESCROW_DEADLINE_SECONDS,
    paymentSeconds: env.P2P_PAYMENT_DEADLINE_SECONDS,
    releaseSeconds: env.P2P_RELEASE_DEADLINE_SECONDS,
    disputeSeconds: env.P2P_DISPUTE_SLA_SECONDS,
    escalationRecheckSeconds: env.P2P_DISPUTE_ESCALATION_RECHECK_SECONDS,
  },
  // No reference price source yet: floating offers are refused rather than
  // priced from a stale number. svc-trade owns pricing (§5.2) and supplies this
  // when its mark-price surface lands.
});

// §0.9. Stage 1: self-only, refuses while any escrow is live, and names what
// it retained and why. Nothing else in the platform calls it yet — svc-p2p
// subscribes to no events, so there is no account-deletion signal to hear.
const erasure = new P2pErasure(sql);

const moderatorUserIds = parseModeratorUserIds(env.P2P_MODERATOR_USER_IDS);

export const appRouter = createP2pRouter(p2p, instruments, erasure, { moderatorUserIds });
export type AppRouter = typeof appRouter;

// Built before the listener opens: a service that cannot authenticate the edge
// must fail to start, not start and serve every request as anonymous.
const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({
  ok: true,
  service: env.SERVICE_NAME,
  moderationReachable: moderatorUserIds.length > 0,
}));
app.get('/ready', async () => ({
  ready: true,
  tradingEnabled: env.P2P_TRADING_ENABLED,
  moderationReachable: moderatorUserIds.length > 0,
}));

/**
 * Doctrine §0.6, as an endpoint. Compares this service's view of what is in
 * escrow against the ledger's, per (seller, asset). Drift here is an operator
 * alarm, not a metric — it means a trade's terms and its value disagree.
 */
app.get('/internal/escrow-integrity', async (req, reply) => {
  if (verifyServiceHeaders(req.headers, env.INTERNAL_SERVICE_SECRET).service === null) {
    return reply.code(401).send({ error: 'service credentials required', code: 'p2p.unauthenticated' });
  }
  const result = await p2p.escrowIntegrity();
  if (!result.ok) reply.status(500);
  return result;
});

/**
 * THE MODERATION BACKLOG, as an endpoint.
 *
 * Nothing disposes of a dispute on a timer any more, so this number is real: it
 * grows when nobody is working the queue and it does not quietly drain into
 * refunds. `neverSeen` is the sharp one — disputes no moderator has ever been
 * served, which is what "the moderation path is unreachable" actually looks
 * like from the outside.
 */
app.get('/internal/moderation-backlog', async (req, reply) => {
  if (verifyServiceHeaders(req.headers, env.INTERNAL_SERVICE_SECRET).service === null) {
    return reply.code(401).send({ error: 'service credentials required', code: 'p2p.unauthenticated' });
  }
  return p2p.moderationBacklog();
});

app.get<{ Params: { userId: string } }>('/internal/reputation/:userId', async (req, reply) => {
  if (verifyServiceHeaders(req.headers, env.INTERNAL_SERVICE_SECRET).service === null) {
    return reply.code(401).send({ error: 'service credentials required', code: 'p2p.unauthenticated' });
  }
  const snapshot = await p2p.reputationOf(req.params.userId);
  return { ...snapshot, badges: [...snapshot.badges] };
});

// ── The sweeps ───────────────────────────────────────────────────────────────

let sweeping = false;

async function sweep(): Promise<void> {
  // Never overlap: two concurrent sweeps would contend on the same row locks
  // and turn a slow ledger into a lock storm.
  if (sweeping) return;
  sweeping = true;
  try {
    const settled = await p2p.sweepSettlements();
    const swept = await p2p.sweepDeadlines();

    // Data retention, on the same tick. It runs last on purpose: it only ever
    // touches trades that are already terminal, so it can never take work away
    // from the two sweeps that keep escrow moving.
    const purged = await instruments.purgeExpiredSnapshots();
    if (purged.purged > 0) {
      app.log.info({ purged: purged.purged }, 'p2p purged payment details from closed trades past the retention window');
    }

    // EVERY FAILURE, WITH ITS REASON, ONE LINE EACH. The sweep used to return
    // a count and discard the error object, so "2 failed" was the whole story
    // an operator got — and the two failures could have been a transient
    // ledger timeout or a guard refusing something that will never succeed on
    // its own. Those need different people out of bed.
    for (const f of settled.failures) {
      app.log.error({ ...f, sweep: 'settlement' }, 'p2p settlement failed — a decision is committed and the value is late');
    }
    for (const f of swept.failures) {
      app.log.error({ ...f, sweep: 'timeout' }, 'p2p timeout sweep could not act on a trade');
    }
    if (swept.escalated > 0) {
      // NOT a retryable failure. These are disputes past their moderator SLA
      // that nobody has ruled on, and the only thing that clears them is a
      // person. Logged every tick on purpose: an alarm that stops sounding
      // because the condition persisted is the alarm that let the old backstop
      // refund seven days of escrow with nobody watching.
      const backlog = await p2p.moderationBacklog();
      app.log.warn({ escalated: swept.escalated, backlog }, 'p2p disputes past the moderator SLA — escrow held, awaiting a human ruling');
    }
  } catch (err) {
    // Never let a sweep failure kill the interval. The one thing worse than a
    // failing sweep is a sweep that stopped running.
    app.log.error({ err }, 'p2p sweep failed');
  } finally {
    sweeping = false;
  }
}

const sweepTimer = setInterval(() => void sweep(), env.P2P_SWEEP_INTERVAL_SECONDS * 1000);
sweepTimer.unref();
await sweep();

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    // The edge terminates auth and forwards the resolved principal; this
    // service never parses a token itself (§4.1 owns that). It does verify the
    // edge's signature over that principal — see packages/contracts/src/edge.ts
    // for why an unsigned header makes every scope check decorative.
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<P2pRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT, tradingEnabled: env.P2P_TRADING_ENABLED, feeBps: env.P2P_FEE_BPS }, 'svc-p2p ready');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      clearInterval(sweepTimer);
      await app.close();
      await bus.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
