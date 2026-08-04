import Fastify from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { env } from './env.js';
import { SupportService } from './support-service.js';
import { createSupportRouter, type SupportRouter } from './router.js';

/**
 * svc-support — tickets + KB (ops.support Stage-1).
 * In-memory store. No ledger. No balances.
 */
const support = new SupportService();
const appRouter = createSupportRouter(support);
const edgeContext = createEdgeContext({
  secret: env.EDGE_PRINCIPAL_SECRET,
  serviceName: env.SERVICE_NAME,
});

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({ ready: true, stage: '1-memory' }));

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<SupportRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT }, 'svc-support ready');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      process.exit(0);
    })();
  });
}
