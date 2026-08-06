import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Fastify from 'fastify';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { MatchingEngine, MemorySnapshotSink } from './engine/engine.js';
import { FileJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';
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
 * svc-matching — THE ENGINE (§5.1).
 *
 * Boot order matters and it is not the same order as svc-ledger's: the journal
 * comes first, and the books are replayed from it before anything can reach a
 * port. §5.1's recovery guarantee is only a guarantee if the process refuses to
 * accept an order until it has finished remembering the ones it already took.
 */

mkdirSync(dirname(env.MATCHING_JOURNAL_PATH), { recursive: true });
const journal = new FileJournal(env.MATCHING_JOURNAL_PATH);

const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  ownedStreams: ['matching'],
});

const snapshotSink = new MemorySnapshotSink();
const engine = new MatchingEngine({
  journal,
  bus,
  snapshotEvery: env.MATCHING_SNAPSHOT_EVERY,
  snapshotSink,
  enabled: env.MATCHING_ENGINE_ENABLED,
});

// Replay before listening — not after, and never lazily on first request.
const recovered = engine.recover();

const app = Fastify({ logger: { level: env.LOG_LEVEL } });

/**
 * `restingOrders` is on here because "the engine came back up" and "the engine
 * came back up still working N orders that may have nothing funding them" read
 * identically on every other field.
 *
 * The journal outlives a database reset. On the dev fleet on 2026-08-03 this
 * engine was holding books for 10 market ids, not one of which still existed in
 * `trade.markets`. Nobody could see that without a shell in the container. The
 * count of orders the engine believes are live is the number an operator needs
 * before anything is allowed to trade against them.
 */
app.get('/health', async () => ({
  ok: true,
  service: env.SERVICE_NAME,
  enabled: engine.isEnabled,
  markets: engine.markets.length,
  restingOrders: engine.restingOrderCount,
  journalRecords: journal.length,
}));

/**
 * Readiness is stricter than liveness. A disabled engine is alive — it still
 * serves depth and still answers health — but it must not receive orders, so
 * the load balancer takes it out of rotation rather than letting every
 * submission come back rejected.
 */
app.get('/ready', async (_req, reply) => {
  if (!engine.isEnabled) return reply.code(503).send({ ready: false, reason: 'matching.engine flag is off' });
  return { ready: true, sequence: engine.markets.length };
});

registerRoutes(app, engine, env.INTERNAL_SERVICE_SECRET, { bodyBind: env.INTERNAL_SERVICE_BODY_BIND });

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });

// The boot line carries the resting count too. Recovery previously reported
// records and markets, which say how much was replayed and not what is now
// standing — and what is now standing is the part another system has to agree
// with.
//
// BOOT CHECK, NOT BOOT REPAIR — deliberately. This service cannot reconcile by
// itself: it has no `DATABASE_URL` (`env.ts` says so, and why), so it does not
// know whether anyone is holding funds against these orders. Comparing requires
// the counterpart's view, which arrives over `POST /reconcile`. What boot CAN
// do honestly is refuse to be quiet about the condition, and that is this.
//
// It does not exit non-zero. An engine that replayed orders is still the only
// thing that can cancel them, and a process that dies on the way up cannot be
// asked anything — including "what are you holding".
const restingAtBoot = engine.restingOrderCount;
app.log.info({ port: env.HTTP_PORT, ...recovered, restingOrders: restingAtBoot }, 'svc-matching ready — books replayed from journal');

if (restingAtBoot > 0) {
  app.log.warn(
    { restingOrders: restingAtBoot, markets: engine.markets.length },
    'engine replayed live orders from the journal — nothing here has checked that anyone still holds funds for them. ' +
      'The journal survives a database reset, so these books can outlive the orders that justified them. ' +
      'Compare before trusting them: GET /markets/:marketId/orders for this side, POST /reconcile with the ' +
      "order owner's view for both (service credentials required; see services/svc-matching/README.md).",
  );
}

// Drain rather than drop: an in-flight submission finishes, its events publish,
// and the journal file descriptor closes cleanly before the process exits.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      engine.setEnabled(false);
      await app.close();
      await bus.close();
      journal.close();
      process.exit(0);
    })();
  });
}
