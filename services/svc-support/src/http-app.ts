import Fastify, { type FastifyInstance } from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { deskVsAgentSplit } from './desk-vs-agent-split.js';
import { identityGroundingProof } from './identity-grounding-honesty.js';
import type { SupportRouter } from './router.js';
import { TICKET_KB_LOOP_OBSERVED_IN_LIVE_COMPOSE, type TicketKbLoopSnapshot } from './ticket-kb-loop-observation.js';

export type SupportHttpAppDeps = {
  router: SupportRouter;
  edgeContext: ReturnType<typeof createEdgeContext>;
  serviceName: string;
  identitySecret: string | undefined;
  loop: { snapshot(): TicketKbLoopSnapshot };
  logLevel?: string;
};

/**
 * The Fastify/tRPC mount `index.ts` listens on. Tests inject this same app
 * so a store-only suite cannot green a procedure nothing registered.
 */
export async function createSupportHttpApp(deps: SupportHttpAppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logLevel ? { level: deps.logLevel } : false,
    maxParamLength: 5_000,
  });

  app.get('/health', async () => {
    const grounding = identityGroundingProof(deps.identitySecret);
    return {
      ok: grounding.wired,
      service: deps.serviceName,
      identityGroundingWired: grounding.wired,
      identityGroundingRefuse: grounding.refuse,
    };
  });

  app.get('/ready', async () => {
    const split = deskVsAgentSplit();
    const grounding = identityGroundingProof(deps.identitySecret);
    const loop = deps.loop.snapshot();
    return {
      ready: grounding.wired,
      stage: split.stage,
      store: 'postgres',
      accountStateSource: split.accountStateSource,
      deskMountain: split.deskMountain,
      agentAssist: split.agentAssist,
      deskStandalone: split.deskStandalone,
      identityGroundingWired: grounding.wired,
      identityGroundingRefuse: grounding.refuse,
      // Live compose observation is Class X. This process reports its own
      // last successful ticket+KB timestamps (zeros until first success).
      ticketKbLoopObservedInLiveCompose: TICKET_KB_LOOP_OBSERVED_IN_LIVE_COMPOSE,
      lastTicketCreateAtMs: loop.lastTicketCreateAtMs,
      lastKbSearchAtMs: loop.lastKbSearchAtMs,
      lastKbGetAtMs: loop.lastKbGetAtMs,
    };
  });

  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: deps.router,
      createContext: ({ req }) => deps.edgeContext({ headers: req.headers, id: req.id }),
    } satisfies FastifyTRPCPluginOptions<SupportRouter>['trpcOptions'],
  });

  await app.ready();
  return app;
}
