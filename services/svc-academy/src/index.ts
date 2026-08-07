import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { env } from './env.js';
import { AcademyService } from './academy-service.js';
import { createHostRightsSource } from './host-rights.js';
import { createStakeSource } from './stake-source.js';
import { isUsable, NullStreamProvider, type StreamProvider } from './stream/provider.js';
import { createAcademyRouter, type AcademyRouter } from './router.js';
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
 * svc-academy — live lobbies with capacity tiers (§8.3, §XIII).
 *
 * Phase 5. No ledger client and no LEDGER_URL: `academy` is `custodial: false`
 * and there is no credential in this process that could reach anything which
 * moves value.
 *
 * NO BUS CONNECTION either, and that is worth stating because most services
 * here have one. Lobbies publish nothing: the §8.3 event this service would
 * eventually emit is `intafaced.identity.xp.earned` on certification, and
 * certification ships with the curriculum. Connecting to NATS to publish
 * nothing would add a boot dependency that can fail, in exchange for no
 * capability at all.
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

const stakes = createStakeSource(env.TOKEN_URL, env.INTERNAL_SERVICE_SECRET);

/** §4.1 `lobbyHostRights` — who may open a room. Read at createRoom, fails closed. */
const hostRights = createHostRightsSource(env.IDENTITY_URL, env.INTERNAL_SERVICE_SECRET);

/**
 * The provider is chosen explicitly, never by fallback.
 *
 * `none` is the only value this build accepts, and it is honest about what it
 * means: lobbies run as seats, presence and the 2D scene, and a request for a
 * stream credential is refused by name rather than answered with a token that
 * cannot connect (SOCKET §13 `socket.stream-provider`).
 */
const stream: StreamProvider = new NullStreamProvider();

const academy = new AcademyService(sql, stakes, hostRights, stream, {
  maxRoomCapacity: env.ACADEMY_MAX_ROOM_CAPACITY,
  tournamentEnabled: env.ACADEMY_TOURNAMENT_ENABLED,
  paperTradingEnabled: env.ACADEMY_PAPER_TRADING_ENABLED,
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
 * A lobby without an SFU is a degraded lobby, not a dead service — seats,
 * presence, capacity, invites and the 2D scene canvas all work without one.
 * Reporting 503 would take the Academy out of the fleet over a feature the rest
 * of it does not need. `usable: false` says the honest thing out loud, in the
 * one place an operator looks, instead of leaving it to be discovered by a user
 * whose join button does nothing.
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
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
