import Fastify from 'fastify';
import { JetStreamEventBus, type Subscription } from '@intafaced/events';
import { env } from './env.js';
import { DepthHub } from './depth/hub.js';
import { DepthPoller } from './depth/poller.js';
import { HttpMarketRegistry, UnionMarketRegistry } from './depth/registry.js';
import { HttpDepthSource } from './depth/source.js';
import { registerRoutes } from './routes.js';
import { TradeHub } from './trade/hub.js';
import { subscribeTradeTape } from './trade/source.js';
import { PrivateOrderHub } from './private/hub.js';
import { subscribePrivateFills, subscribePrivateOrders, subscribePrivatePositions } from './private/source.js';
import { createPrivateWebSocketGateway } from './private/gateway.js';
import { createWebSocketGateway } from './ws/gateway.js';
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
 * svc-ws — live public market data (§5.2 ws.gateway).
 *
 * ── Why this is its own service ─────────────────────────────────────────────
 *
 * The two other candidates both fail the same test.
 *
 * **svc-matching** has the book, and holds `INTERNAL_SERVICE_SECRET` because it
 * authenticates order writes. Opening a browser-facing socket there would put
 * the public internet on the same port as the engine that takes orders, and
 * would mean adding svc-matching to the edge's route table — a table whose
 * comment says in as many words that svc-matching is deliberately absent.
 *
 * **svc-trade** is already mounted and already consumes `orderFilled`, which is
 * the argument for it. But it cannot build a book from those events —
 * `intafaced.matching.order.accepted` carries no side, price or quantity — so
 * it would have to poll svc-matching exactly as this does, while holding
 * `INTERNAL_SERVICE_SECRET` for both the ledger and the engine and calling
 * `ledger.hold` on the money path. Attaching an unauthenticated public socket
 * to that process trades the entire custodial blast radius for one saved
 * container.
 *
 * So: a process that holds nothing. No database, no ledger client, no service
 * secret, no principal key. Depth is a public GET re-broadcast; trades are a
 * public strip of `orderFilled` off the bus. See README.md.
 */

const source = new HttpDepthSource({ baseUrl: env.MATCHING_URL });

const app = Fastify({ logger: { level: env.LOG_LEVEL } });

/**
 * WHAT A CLIENT MAY SUBSCRIBE TO — and why it is not the engine's list.
 *
 * Depth still comes from svc-matching and only from svc-matching. This decides
 * a different question: which market IDS are real. The engine's `/markets` is
 * the books it holds, which is neither the listing nor a subset of it once
 * `trade.markets` has been reseeded — on the running fleet the engine's ten
 * journal-replayed ids and svc-trade's sixteen listed ids did not overlap at
 * all, so every id the browser could discover was refused with `unknown
 * market`. `depth/registry.ts` has the full account.
 *
 * The listing service comes first because it is the authority; the engine stays
 * in the union because its ids are provably real and because a listing service
 * that is down must not take the whole public feed with it.
 */
const registry = new UnionMarketRegistry(
  [
    { name: 'svc-trade', registry: new HttpMarketRegistry({ baseUrl: env.TRADE_URL }) },
    { name: 'svc-matching', registry: source },
  ],
  app.log,
);

const hub = new DepthHub(
  source,
  {
    depthLimit: env.WS_DEPTH_LIMIT,
    highWaterBytes: env.WS_HIGH_WATER_BYTES,
    maxLagTicks: env.WS_MAX_LAG_TICKS,
    maxConnections: env.WS_MAX_CONNECTIONS,
    marketsRefreshMs: env.WS_MARKETS_REFRESH_MS,
    registry,
  },
  app.log,
);

const tradeHub = new TradeHub(
  {
    highWaterBytes: env.WS_HIGH_WATER_BYTES,
    maxLagTicks: env.WS_MAX_LAG_TICKS,
    maxConnections: env.WS_MAX_CONNECTIONS,
    recentLimit: env.WS_TRADE_RECENT_LIMIT,
    ensureKnownMarket: (marketId) => hub.ensureKnownMarket(marketId),
  },
  app.log,
);

const privateOrderHub = new PrivateOrderHub(
  {
    highWaterBytes: env.WS_HIGH_WATER_BYTES,
    maxLagTicks: env.WS_MAX_LAG_TICKS,
    maxConnections: env.WS_MAX_CONNECTIONS,
    maxConnectionsPerUser: env.WS_PRIVATE_MAX_CONNECTIONS_PER_USER,
  },
  app.log,
);

const privateTokens =
  env.JWT_ACCESS_SECRET === undefined
    ? null
    : {
        secret: env.JWT_ACCESS_SECRET,
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        accessTtlSeconds: 900,
      };

let enabled = env.WS_GATEWAY_ENABLED;
const isEnabled = () => enabled;

/**
 * Bus subscription handles — declared before routes so /ready getters can read
 * them. Filled (or left null) in the NATS boot block below.
 */
let bus: Awaited<ReturnType<typeof JetStreamEventBus.connect>> | null = null;
let tradeSub: Subscription | null = null;
let privateSub: Subscription | null = null;
let privateFillSub: Subscription | null = null;
let privatePositionSub: Subscription | null = null;

const poller = new DepthPoller(
  source,
  hub,
  { intervalMs: env.WS_POLL_INTERVAL_MS, depthLimit: env.WS_DEPTH_LIMIT, marketsRefreshMs: env.WS_MARKETS_REFRESH_MS },
  app.log,
);

registerRoutes(app, {
  hub,
  tradeHub,
  privateHub: privateOrderHub,
  source,
  depthLimit: env.WS_DEPTH_LIMIT,
  serviceName: env.SERVICE_NAME,
  upstream: env.MATCHING_URL,
  enabled: isEnabled,
  // Mutable getters: boot may fail the NATS subscribe and leave these null.
  tradesBus: () => tradeSub !== null,
  privateBus: () => privateSub !== null,
});

/**
 * The market list is fetched before the port opens, not lazily on the first
 * connection. A subscription is refused unless the market is on it, so a
 * gateway that has never fetched it would refuse every client and look like a
 * bug in the terminal rather than a boot ordering problem.
 *
 * A failure here is not fatal: an upstream may simply be starting, and the
 * union only throws when EVERY source failed. The list refreshes on a timer and
 * a connection that misses triggers one refetch.
 */
await hub.refreshMarkets().catch((err: unknown) => {
  app.log.warn(
    { err: String(err), listing: env.TRADE_URL, engine: env.MATCHING_URL },
    'svc-ws: could not read the market list at boot — will retry on the timer',
  );
});

/**
 * Trade tape: subscribe to `orderFilled` if NATS is up. Depth must keep
 * working when the bus is down — a public book feed should not die because
 * JetStream hiccuped. `ownedStreams: []` — matching owns the stream.
 */
try {
  bus = await JetStreamEventBus.connect({
    servers: env.NATS_URL,
    producer: env.SERVICE_NAME,
    streamPrefix: env.NATS_STREAM_PREFIX,
    ownedStreams: [],
  });
  tradeSub = await subscribeTradeTape({
    bus,
    hub: tradeHub,
    durable: env.WS_TRADES_DURABLE,
    log: app.log,
  });
  if (privateTokens) {
    privateSub = await subscribePrivateOrders({
      bus,
      hub: privateOrderHub,
      durable: env.WS_PRIVATE_ORDERS_DURABLE,
      log: app.log,
    });
    privateFillSub = await subscribePrivateFills({
      bus,
      hub: privateOrderHub,
      durable: `${env.WS_PRIVATE_ORDERS_DURABLE}-fills`,
      log: app.log,
    });
    privatePositionSub = await subscribePrivatePositions({
      bus,
      hub: privateOrderHub,
      durable: `${env.WS_PRIVATE_ORDERS_DURABLE}-positions`,
      log: app.log,
    });
  }
} catch (err) {
  // Honest: there is no auto-reconnect loop yet. /ready stays green (depth
  // works) but tradesBus/privateBus stay false until process restart.
  app.log.warn(
    { err: String(err), nats: env.NATS_URL },
    'svc-ws: trade/private bus unavailable at boot — depth still serves; tape empty until process restart (no auto-reconnect yet)',
  );
  bus = null;
  tradeSub = null;
  privateSub = null;
  privateFillSub = null;
  privatePositionSub = null;
}

await app.listen({ host: env.HTTP_HOST, port: env.HTTP_PORT });

const gateway = createWebSocketGateway({
  server: app.server,
  hub,
  tradeHub,
  heartbeatMs: env.WS_HEARTBEAT_MS,
  log: app.log,
  enabled: isEnabled,
});

const privateGateway = createPrivateWebSocketGateway({
  server: app.server,
  hub: privateOrderHub,
  heartbeatMs: env.WS_HEARTBEAT_MS,
  log: app.log,
  enabled: isEnabled,
  tokens: privateTokens,
});

poller.start();

app.log.info(
  {
    port: env.HTTP_PORT,
    upstream: env.MATCHING_URL,
    listing: env.TRADE_URL,
    markets: hub.knownMarkets.length,
    depthLimit: env.WS_DEPTH_LIMIT,
    pollMs: env.WS_POLL_INTERVAL_MS,
    trades: tradeSub !== null,
    privateOrders: privateSub !== null && privateTokens !== null,
    privatePositions: privatePositionSub !== null && privateTokens !== null,
    enabled,
  },
  'svc-ws ready — depth + trade tape + private orders/fills/positions',
);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      // Stop producing before closing sockets, so nothing is written to a
      // socket that is mid-close, and tell every client why it is going.
      enabled = false;
      poller.stop();
      if (tradeSub) await tradeSub.unsubscribe().catch(() => undefined);
      if (privateSub) await privateSub.unsubscribe().catch(() => undefined);
      if (privateFillSub) await privateFillSub.unsubscribe().catch(() => undefined);
      if (privatePositionSub) await privatePositionSub.unsubscribe().catch(() => undefined);
      if (bus) await bus.close().catch(() => undefined);
      await gateway.close('gateway shutting down');
      await privateGateway.close('gateway shutting down');
      await app.close();
      process.exit(0);
    })();
  });
}
