import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Fastify from 'fastify';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { MatchingEngine, MemorySnapshotSink } from './engine/engine.js';
import { FileJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';

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
// with. `pnpm reconcile:check` turns this number into a comparison.
const restingAtBoot = engine.restingOrderCount;
app.log.info({ port: env.HTTP_PORT, ...recovered, restingOrders: restingAtBoot }, 'svc-matching ready — books replayed from journal');

if (restingAtBoot > 0) {
  app.log.warn(
    { restingOrders: restingAtBoot, markets: engine.markets.length },
    'engine replayed live orders from the journal — nothing here has checked that anyone still holds funds for them. ' +
      'Run `pnpm reconcile:check` before trusting these books.',
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
