import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { ModelGateway } from './gateway/gateway.js';
import { DEFAULT_ROUTING_TABLE, parseRoutingTable, type RoutingTable } from './gateway/routing.js';
import { createLedgerClient } from './ledger-client.js';
import { UsageMeter } from './metering/meter.js';
import { MockModelProvider } from './providers/mock.js';
import { UpstreamModelProvider } from './providers/upstream.js';
import type { ModelProvider } from './providers/provider.js';
import { AgentRuntime } from './runtime.js';
import { createAgentsRouter, type AgentsRouter } from './router.js';

/**
 * svc-agents — the agent fleet runtime and model gateway (§8.2).
 *
 * This process is the runtime. It ships with NO agents: Navigator, Support,
 * Market Scanner and Merchant are separate work that registers guardrails
 * against this service and drives `openSession → think → act → settle`.
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'agents,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM agents.agent_definitions LIMIT 1`.catch(() => {
  throw new Error('agents schema is missing — run migrations before starting svc-agents');
});

/**
 * The provider registered as `primary`.
 *
 * Which one that is comes from configuration, and the default is the
 * deterministic mock: a developer should be able to run the fleet without an
 * upstream credential, and starting this service by accident must not be able
 * to spend money.
 */
function buildPrimaryProvider(): ModelProvider {
  if (env.AGENTS_PROVIDER === 'mock') return new MockModelProvider({ id: 'primary' });

  if (!env.AGENTS_UPSTREAM_BASE_URL || !env.AGENTS_UPSTREAM_API_KEY) {
    throw new Error('AGENTS_PROVIDER=upstream requires AGENTS_UPSTREAM_BASE_URL and AGENTS_UPSTREAM_API_KEY');
  }

  return new UpstreamModelProvider({
    id: 'primary',
    baseUrl: env.AGENTS_UPSTREAM_BASE_URL,
    apiKey: env.AGENTS_UPSTREAM_API_KEY,
    authHeader: env.AGENTS_UPSTREAM_AUTH_HEADER,
    authPrefix: env.AGENTS_UPSTREAM_AUTH_PREFIX,
    headers: env.AGENTS_UPSTREAM_HEADERS,
    completionsPath: env.AGENTS_UPSTREAM_COMPLETIONS_PATH,
    ...(env.AGENTS_UPSTREAM_EMBEDDINGS_PATH ? { embeddingsPath: env.AGENTS_UPSTREAM_EMBEDDINGS_PATH } : {}),
    models: env.AGENTS_UPSTREAM_MODELS,
    timeoutMs: env.AGENTS_UPSTREAM_TIMEOUT_MS,
  });
}

function buildRoutingTable(): RoutingTable {
  if (!env.AGENTS_ROUTING_TABLE) return DEFAULT_ROUTING_TABLE;
  return parseRoutingTable(JSON.parse(env.AGENTS_ROUTING_TABLE));
}

const gateway = new ModelGateway([buildPrimaryProvider()], buildRoutingTable());

const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  ownedStreams: ['agents'],
});

// Metered usage moves value, and value moves through svc-ledger — never
// through this service's own tables (Doctrine §0.6).
const ledger = createLedgerClient(env.LEDGER_URL, env.INTERNAL_SERVICE_SECRET);

const meter = new UsageMeter(sql, ledger, {
  assetId: env.AGENTS_FEE_ASSET_ID,
  windowMinutes: env.AGENTS_USAGE_WINDOW_MINUTES,
});

const runtime = new AgentRuntime(sql, gateway, meter, bus, {
  feeAssetId: env.AGENTS_FEE_ASSET_ID,
  meteringEnabled: env.AGENTS_METERING_ENABLED,
});

const appRouter = createAgentsRouter({ runtime, gateway, meter, feeAssetId: env.AGENTS_FEE_ASSET_ID });

// Built before the listener opens: a service that cannot authenticate the edge
// must fail to start, not start and serve every request as anonymous.
const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({
  ready: true,
  // Deliberately reports the LOGICAL provider id and the task list. An operator
  // needs to know routing is loaded; nobody needs a vendor name on a health
  // endpoint (Doctrine §0.7).
  meteringEnabled: env.AGENTS_METERING_ENABLED,
  tasks: gateway.routingTable.routes.map((r) => r.task),
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
  } satisfies FastifyTRPCPluginOptions<AgentsRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info(
  { port: env.HTTP_PORT, provider: env.AGENTS_PROVIDER, metering: env.AGENTS_METERING_ENABLED, tasks: gateway.routingTable.routes.length },
  'svc-agents ready',
);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      // Draining, not dropping: an in-flight settlement finishes before exit.
      await app.close();
      await bus.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
