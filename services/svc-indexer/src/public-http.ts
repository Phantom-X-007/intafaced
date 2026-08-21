import type { FastifyInstance } from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import type { Indexer } from './indexer.js';
import { readinessOf } from './ready.js';
import type { IndexerRouter } from './router.js';

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
  readonly chainId: number;
  readonly ingestEnabled: () => boolean;
  /** Production pings Postgres; tests pass a no-op or a throw. */
  readonly dbPing: () => Promise<void>;
  readonly createContext: NonNullable<FastifyTRPCPluginOptions<IndexerRouter>['trpcOptions']['createContext']>;
  readonly onTrpcError?: FastifyTRPCPluginOptions<IndexerRouter>['trpcOptions']['onError'];
}

export async function registerIndexerPublicHttp(app: FastifyInstance, deps: IndexerPublicHttpDeps): Promise<void> {
  app.get('/health', async () => ({
    ok: true,
    service: deps.serviceName,
    chainId: deps.chainId,
    custodial: false,
    ingestEnabled: deps.ingestEnabled(),
  }));

  /**
   * Readiness is whether this projection trusts itself.
   *
   * Halt wins over lastError and DB: a projection that knows it is wrong must
   * leave the rotation even if Postgres still answers. `/health` stays liveness.
   */
  app.get('/ready', async (_req, reply) => {
    try {
      await deps.dbPing();
      const answer = readinessOf(deps.indexer.halted, true, undefined, deps.indexer.lastError);
      return reply.code(answer.httpStatus).send(answer.body);
    } catch (err) {
      const answer = readinessOf(deps.indexer.halted, false, (err as Error).message, deps.indexer.lastError);
      return reply.code(answer.httpStatus).send(answer.body);
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
