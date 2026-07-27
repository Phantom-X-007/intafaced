import Fastify from 'fastify';
import { createDb } from '@intafaced/db';
import { JetStreamEventBus } from '@intafaced/events';
import { checkAccess } from '@intafaced/config';
import type { Address } from 'viem';
import { env } from './env.js';
import * as schema from './db/schema.js';
import { PostgresAccountStore } from './db/postgres-store.js';
import { AccountRegistry } from './accounts/registry.js';
import { ProtocolChain } from './chain/client.js';
import { SessionRelay } from './session/relay.js';
import { ChainObserver } from './events.js';
import { createProtocolRouter } from './router.js';

/**
 * svc-protocol — the Protocol Plane's smart account layer (§17.4, §17.5).
 *
 * Boot order: database, bus, chain, then the server. Nothing serves a request
 * until every dependency it needs is proven up.
 *
 * Two things this boot deliberately does not do:
 *   · it loads no private key, because there is no transaction this service is
 *     entitled to originate on a user's account
 *   · it opens no ledger connection, because this plane posts nothing
 */

const db = createDb({ url: env.DATABASE_URL, schema: 'protocol', max: env.DATABASE_POOL_MAX, ssl: env.DATABASE_SSL }, schema);

// The read model must exist before we claim to serve it — a missing table here
// is a missed migration, and it should fail at boot rather than on a user's
// first request.
const [table] = await db.sql<Array<{ exists: boolean }>>`
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'protocol' AND table_name = 'smart_accounts'
  ) AS exists
`;
if (!table?.exists) {
  throw new Error('protocol.smart_accounts is missing — run migrations before starting svc-protocol');
}

const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  ownedStreams: ['protocol'],
});

const chain = new ProtocolChain({
  chainId: env.PROTOCOL_CHAIN_ID,
  rpcUrl: env.PROTOCOL_RPC_URL,
  entryPoint: env.PROTOCOL_ENTRYPOINT_ADDRESS as Address,
  factory: env.PROTOCOL_FACTORY_ADDRESS as Address,
  implementation: env.PROTOCOL_IMPLEMENTATION_ADDRESS as Address,
  ...(env.PROTOCOL_BUNDLER_URL ? { bundlerUrl: env.PROTOCOL_BUNDLER_URL } : {}),
});

const registry = new AccountRegistry(new PostgresAccountStore(db.drizzle), {
  chainId: env.PROTOCOL_CHAIN_ID,
  factory: env.PROTOCOL_FACTORY_ADDRESS as Address,
  implementation: env.PROTOCOL_IMPLEMENTATION_ADDRESS as Address,
});

const relay = new SessionRelay(chain);

let relayEnabled = env.PROTOCOL_RELAY_ENABLED;

export const appRouter = createProtocolRouter({ chain, registry, relay, relayEnabled: () => relayEnabled });
export type AppRouter = typeof appRouter;

const app = Fastify({ logger: { level: env.LOG_LEVEL } });

const observer = new ChainObserver({
  chain,
  bus,
  registry,
  onError: (err, context) => app.log.error({ err, context }, 'chain observer error'),
});

app.get('/health', async () => ({
  ok: true,
  service: env.SERVICE_NAME,
  chainId: env.PROTOCOL_CHAIN_ID,
  custodial: false,
  relayEnabled,
}));

/**
 * Readiness is about the chain, not about us: a service that cannot read the
 * chain cannot answer any question a user has, so it leaves the rotation.
 */
app.get('/ready', async (_req, reply) => {
  try {
    await chain.client.getBlockNumber();
    return { ready: true };
  } catch (err) {
    return reply.code(503).send({ ready: false, reason: (err as Error).message });
  }
});

/**
 * §22, asserted at boot rather than assumed.
 *
 * If a future edit ever makes this module custodial, or moves it off the
 * protocol plane, the service refuses to start instead of quietly beginning to
 * gate users who were promised they would never be gated.
 */
const sovereignty = checkAccess({ module: 'protocol', plane: 'protocol', region: 'XX', kycTier: 'none' });
if (sovereignty.code !== 'allowed.permissionless') {
  throw new Error(
    `THE SOVEREIGNTY LAW IS BROKEN (§22): checkAccess for module "protocol" on the protocol plane ` +
      `returned "${sovereignty.code}", not "allowed.permissionless". Refusing to start.`,
  );
}

observer.start();

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info(
  { port: env.HTTP_PORT, chainId: env.PROTOCOL_CHAIN_ID, factory: env.PROTOCOL_FACTORY_ADDRESS },
  'svc-protocol ready — non-custodial, permissionless',
);

/** The kill-switch surface `apps/admin` reaches (§14 admin controls). */
export function setRelayEnabled(next: boolean): void {
  relayEnabled = next;
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      observer.stop();
      await app.close();
      await bus.close();
      await db.close();
      process.exit(0);
    })();
  });
}
