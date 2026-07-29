import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { AcademyService } from './academy-service.js';
import { createStakeSource } from './stake-source.js';
import { isUsable, NullStreamProvider, type StreamProvider } from './stream/provider.js';
import { createAcademyRouter, type AcademyRouter } from './router.js';

/**
 * svc-academy — lobbies, curriculum, certifications (§8.3).
 *
 * Phase 5. No ledger client and no LEDGER_URL: `academy` is `custodial: false`
 * and there is no credential in this process that could reach anything which
 * moves value.
 *
 * It DOES connect to the bus, for exactly one subject:
 * `intafaced.identity.xp.earned`, published when a certification is awarded.
 * That subject lives on the `identity` stream, which svc-identity owns — hence
 * `ownedStreams: []` here and a `depends_on` on svc-identity in compose. A
 * consumer against a stream its owner has not created yet fails at boot, which
 * is the same ordering svc-trade needs and for the same reason.
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'academy,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM academy.rooms LIMIT 1`.catch(() => {
  throw new Error('academy schema is missing — run migrations before starting svc-academy');
});

const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  // Owns none: the only subject it publishes belongs to svc-identity's stream.
  ownedStreams: [],
});

const stakes = createStakeSource(env.TOKEN_URL, env.INTERNAL_SERVICE_SECRET);

/**
 * The provider is chosen explicitly, never by fallback.
 *
 * `none` is the only value this build accepts, and it is honest about what it
 * means: lobbies run as seats, presence and the 2D scene, and a request for a
 * stream credential is refused by name rather than answered with a token that
 * cannot connect (SOCKET §13 `socket.stream-provider`).
 */
const stream: StreamProvider = new NullStreamProvider();

const academy = new AcademyService(sql, stakes, stream, bus, {
  xp: { base: env.ACADEMY_CERT_XP_BASE, perItem: env.ACADEMY_CERT_XP_PER_ITEM },
  maxRoomCapacity: env.ACADEMY_MAX_ROOM_CAPACITY,
});

export const appRouter = createAcademyRouter(academy);
export type AppRouter = typeof appRouter;

// Built before the listener opens: a service that cannot authenticate the edge
// must fail to start, not start and serve every request as anonymous.
const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));

/**
 * Readiness reports the streaming provider rather than gating on it.
 *
 * A lobby without an SFU is a degraded lobby, not a dead service — text,
 * presence, capacity, the scene canvas and the entire curriculum half all work.
 * Reporting 503 would take the Academy out of the fleet over a feature most of
 * it does not use. `streamUsable: false` says the honest thing out loud.
 */
app.get('/ready', async () => ({
  ready: true,
  stream: { id: stream.id, usable: isUsable(stream), configured: env.ACADEMY_STREAM_PROVIDER },
}));

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    // The edge terminates auth and forwards the resolved principal; this
    // service never parses a token itself (§4.1 owns that). It does verify the
    // edge's signature over that principal — see packages/contracts/src/edge.ts
    // for why an unsigned header makes every scope check decorative.
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<AcademyRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT, stream: stream.id, trpc: true }, 'svc-academy ready');

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
