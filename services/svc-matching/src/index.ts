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

app.get('/health', async () => ({
  ok: true,
  service: env.SERVICE_NAME,
  enabled: engine.isEnabled,
  markets: engine.markets.length,
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
app.log.info({ port: env.HTTP_PORT, ...recovered }, 'svc-matching ready — books replayed from journal');

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
