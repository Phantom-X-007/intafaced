import type { FastifyInstance } from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { clobFixtureRefusesLiveClaim, clobHonesty, INDEXER_CLOB_FIXTURE_NOT_LIVE } from './clob-honesty.js';
import { indexerHealthHonesty } from './health-honesty.js';
import type { Indexer } from './indexer.js';
import { readinessOf } from './ready.js';
import type { IndexerRouter } from './router.js';
import { userCopy } from './user-copy.js';

/**
 * The public Fastify door — `/health`, `/ready`, `/trpc`.
 *
 * Extracted from boot so D26-P1-I3 proofs can inject the same handlers the
 * process serves. A helper-only `/ready` answer is not this door: load
 * balancers and `/trpc` callers never call `readinessOf` themselves.
 */
export interface IndexerPublicHttpDeps {
  readonly indexer: Indexer;
  readonly appRouter: IndexerRouter;
  readonly serviceName: string;
  readonly ingestEnabled: () => boolean;
  /** Production pings Postgres; tests pass a no-op or a throw. */
  readonly dbPing: () => Promise<void>;
  readonly createContext: NonNullable<FastifyTRPCPluginOptions<IndexerRouter>['trpcOptions']['createContext']>;
  readonly onTrpcError?: FastifyTRPCPluginOptions<IndexerRouter>['trpcOptions']['onError'];
  readonly venue?: string | null;
  /** `APP_ENV=prod` — fixture ABI must not rotate in as a live CLOB. */
  readonly claimLiveClob?: boolean;
}

export async function registerIndexerPublicHttp(app: FastifyInstance, deps: IndexerPublicHttpDeps): Promise<void> {
  app.get('/health', async () =>
    indexerHealthHonesty({
      ingestEnabled: deps.ingestEnabled(),
      venue: deps.venue,
    }),
  );

  /**
   * Readiness is whether this projection trusts itself.
   *
   * Halt wins over lastError and DB: a projection that knows it is wrong must
   * leave the rotation even if Postgres still answers. `/health` stays liveness.
   * Fixture ABI presented as a live CLOB also leaves the rotation.
   */
  app.get('/ready', async (_req, reply) => {
    const clob = clobHonesty(deps.venue);
    if (clobFixtureRefusesLiveClaim({ claimLiveClob: deps.claimLiveClob === true, venue: deps.venue })) {
      return reply.code(503).send({
        ready: false,
        reason: userCopy(INDEXER_CLOB_FIXTURE_NOT_LIVE),
        clob,
      });
    }
    try {
      await deps.dbPing();
      const answer = readinessOf(deps.indexer.halted, true, undefined, deps.indexer.lastError);
      return reply.code(answer.httpStatus).send({ ...answer.body, clob });
    } catch (err) {
      const answer = readinessOf(deps.indexer.halted, false, (err as Error).message, deps.indexer.lastError);
      return reply.code(answer.httpStatus).send({ ...answer.body, clob });
    }
  });

  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: deps.appRouter,
      createContext: deps.createContext,
      ...(deps.onTrpcError ? { onError: deps.onTrpcError } : {}),
    } satisfies FastifyTRPCPluginOptions<IndexerRouter>['trpcOptions'],
  });
}
