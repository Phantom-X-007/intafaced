import Fastify from 'fastify';
import postgres from 'postgres';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { createEdgeContext } from '@intafaced/contracts';
import { JetStreamEventBus } from '@intafaced/events';
import { env } from './env.js';
import { P2pService } from './p2p-service.js';
import { createLedgerClient } from './ledger-client.js';
import { createP2pRouter, type P2pRouter } from './router.js';

/**
 * svc-p2p — peer-to-peer trading with escrow (§6.2).
 *
 * Two things start here that are not optional, and both are the same promise
 * from different ends:
 *
 *   · the TIMEOUT sweep, which resolves any trade whose deadline has passed;
 *   · the SETTLEMENT sweep, which posts any resolution that was decided but
 *     not yet acted on.
 *
 * Between them, no trade can sit in escrow indefinitely and no decision can go
 * unexecuted. If this process does not run the sweeps, escrow eventually
 * strands — so they are started before the HTTP listener, not after.
 */

const sql = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? 'require' : false,
  connection: { search_path: 'p2p,public', application_name: env.SERVICE_NAME },
  onnotice: () => undefined,
});

await sql`SELECT 1 FROM p2p.p2p_trades LIMIT 1`.catch(() => {
  throw new Error('p2p schema is missing — run migrations before starting svc-p2p');
});

const bus = await JetStreamEventBus.connect({
  servers: env.NATS_URL,
  producer: env.SERVICE_NAME,
  streamPrefix: env.NATS_STREAM_PREFIX,
  ownedStreams: ['p2p'],
});

// Escrowed value lives in svc-ledger's `escrow` accounts, never in this
// service's tables (Doctrine §0.6). This client is the only path.
const ledger = createLedgerClient(env.LEDGER_URL, env.INTERNAL_SERVICE_SECRET);

const p2p = new P2pService(sql, ledger, bus, {
  feeBps: env.P2P_FEE_BPS,
  tradingEnabled: env.P2P_TRADING_ENABLED,
  disputeBackstopResolution: env.P2P_DISPUTE_BACKSTOP_RESOLUTION,
  backstopModeratorId: env.P2P_BACKSTOP_MODERATOR_ID,
  deadlines: {
    escrowSeconds: env.P2P_ESCROW_DEADLINE_SECONDS,
    paymentSeconds: env.P2P_PAYMENT_DEADLINE_SECONDS,
    releaseSeconds: env.P2P_RELEASE_DEADLINE_SECONDS,
    disputeSeconds: env.P2P_DISPUTE_BACKSTOP_SECONDS,
  },
  // No reference price source yet: floating offers are refused rather than
  // priced from a stale number. svc-trade owns pricing (§5.2) and supplies this
  // when its mark-price surface lands.
});

export const appRouter = createP2pRouter(p2p);
export type AppRouter = typeof appRouter;

// Built before the listener opens: a service that cannot authenticate the edge
// must fail to start, not start and serve every request as anonymous.
const edgeContext = createEdgeContext({ secret: env.EDGE_PRINCIPAL_SECRET, serviceName: env.SERVICE_NAME });

const app = Fastify({ logger: { level: env.LOG_LEVEL }, maxParamLength: 5_000 });

app.get('/health', async () => ({ ok: true, service: env.SERVICE_NAME }));
app.get('/ready', async () => ({ ready: true, tradingEnabled: env.P2P_TRADING_ENABLED }));

/**
 * Doctrine §0.6, as an endpoint. Compares this service's view of what is in
 * escrow against the ledger's, per (seller, asset). Drift here is an operator
 * alarm, not a metric — it means a trade's terms and its value disagree.
 */
app.get('/internal/escrow-integrity', async (_req, reply) => {
  const result = await p2p.escrowIntegrity();
  if (!result.ok) reply.status(500);
  return result;
});

app.get<{ Params: { userId: string } }>('/internal/reputation/:userId', async (req) => {
  const snapshot = await p2p.reputationOf(req.params.userId);
  return { ...snapshot, badges: [...snapshot.badges] };
});

// ── The sweeps ───────────────────────────────────────────────────────────────

let sweeping = false;

async function sweep(): Promise<void> {
  // Never overlap: two concurrent sweeps would contend on the same row locks
  // and turn a slow ledger into a lock storm.
  if (sweeping) return;
  sweeping = true;
  try {
    const settled = await p2p.sweepSettlements();
    const swept = await p2p.sweepDeadlines();
    if (settled.failed > 0 || swept.failed > 0) {
      app.log.warn({ settled, swept }, 'p2p sweep left work behind — it will retry next tick');
    }
  } catch (err) {
    // Never let a sweep failure kill the interval. The one thing worse than a
    // failing sweep is a sweep that stopped running.
    app.log.error({ err }, 'p2p sweep failed');
  } finally {
    sweeping = false;
  }
}

const sweepTimer = setInterval(() => void sweep(), env.P2P_SWEEP_INTERVAL_SECONDS * 1000);
sweepTimer.unref();
await sweep();

await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    // The edge terminates auth and forwards the resolved principal; this
    // service never parses a token itself (§4.1 owns that). It does verify the
    // edge's signature over that principal — see packages/contracts/src/edge.ts
    // for why an unsigned header makes every scope check decorative.
    createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
  } satisfies FastifyTRPCPluginOptions<P2pRouter>['trpcOptions'],
});

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });
app.log.info({ port: env.HTTP_PORT, tradingEnabled: env.P2P_TRADING_ENABLED, feeBps: env.P2P_FEE_BPS }, 'svc-p2p ready');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      clearInterval(sweepTimer);
      await app.close();
      await bus.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    })();
  });
}
