import Fastify from 'fastify';
import postgres from 'postgres';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { BlueprintService } from './blueprint-service.js';
import { HttpNeuralEngineClient } from './engine/http-engine.js';
import { MockNeuralEngine } from './engine/mock-engine.js';
import { isUsable, type NeuralEngineClient } from './engine/neural-engine.js';

/**
 * svc-blueprint — the Identity Blueprint (§7.1).
 *
 * Phase 4. Onboarding intelligence consumed as an internal service over an HTTP
 * contract, plus crew matching, mentor shortlists, and the export/erase pair
 * §7.2 requires.
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'blueprint,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM blueprint.blueprints LIMIT 1`.catch(() => {
  throw new Error('blueprint schema is missing — run migrations before starting svc-blueprint');
});

const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  ownedStreams: ['blueprint'],
});

/**
 * The engine is chosen explicitly, never by fallback.
 *
 * A service that silently degrades to the mock when the real engine is
 * unreachable would hand stub profiles to real people and look healthy doing
 * it. `BLUEPRINT_ENGINE_MODE` is the switch, and it is loud.
 */
const engine: NeuralEngineClient =
  env.BLUEPRINT_ENGINE_MODE === 'mock'
    ? new MockNeuralEngine()
    : new HttpNeuralEngineClient({
        baseUrl: env.BLUEPRINT_ENGINE_URL,
        timeoutMs: env.BLUEPRINT_ENGINE_TIMEOUT_MS,
        ...(env.BLUEPRINT_ENGINE_API_KEY ? { apiKey: env.BLUEPRINT_ENGINE_API_KEY } : {}),
      });

const blueprint = new BlueprintService(sql, engine, bus, {
  crewCapacity: env.BLUEPRINT_CREW_CAPACITY,
  mentorShortlistSize: env.BLUEPRINT_MENTOR_SHORTLIST_SIZE,
  season: env.BLUEPRINT_SEASON,
});

const app = Fastify({ logger: { level: env.LOG_LEVEL } });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));

/**
 * Readiness includes the engine, because a Blueprint cannot be produced without
 * it. Reporting ready while the engine is down would route onboarding traffic
 * at a service that can only fail it.
 */
app.get('/ready', async () => ({
  ready: true,
  engine: { id: engine.id, usable: isUsable(engine), mode: env.BLUEPRINT_ENGINE_MODE },
}));

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT, engineMode: env.BLUEPRINT_ENGINE_MODE, season: env.BLUEPRINT_SEASON }, 'svc-blueprint ready');

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
