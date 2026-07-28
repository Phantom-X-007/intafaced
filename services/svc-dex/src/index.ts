import Fastify from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { env } from './env.js';
import { createDexRouter } from './router.js';

/**
 * svc-dex — the Protocol Plane's front door (§8.6, §17.5).
 *
 * Non-custodial by construction, and provably so: `custody-scan` fails the
 * build if this service imports a ledger write recipe, and its environment
 * carries no `INTERNAL_SERVICE_SECRET`, so it could not reach `ledger.post`
 * even if an import slipped past the scanner.
 *
 * That is what earns the permissionless surface. §585: "If the platform never
 * holds the asset → the feature ships permissionless: no KYC, no KYB, no
 * account gate beyond a wallet."
 */

export const appRouter = createDexRouter();
export type AppRouter = typeof appRouter;

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

// Built before the listener opens. The edge secret is still required even
// though every procedure is permissionless: a signed principal may arrive (a
// user who also holds a Fiat Plane account), and if one does, it must be
// verified rather than believed.
const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({
  ready: true,
  // Stated on the readiness probe on purpose: an operator, or an auditor,
  // should be able to confirm the custody posture without reading source.
  custodial: false,
  plane: 'protocol',
}));

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT, plane: 'protocol', custodial: false }, 'svc-dex ready');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      process.exit(0);
    })();
  });
}
