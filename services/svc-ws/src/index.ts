import Fastify from 'fastify';
import { JetStreamEventBus, type Subscription } from '@intafaced/events';
import { env } from './env.js';
import { DepthHub } from './depth/hub.js';
import { DepthPoller } from './depth/poller.js';
import { HttpDepthSource } from './depth/source.js';
import { registerRoutes } from './routes.js';
import { TradeHub } from './trade/hub.js';
import { subscribeTradeTape } from './trade/source.js';
import { PrivateOrderHub } from './private/hub.js';
import { subscribePrivateFills, subscribePrivateOrders } from './private/source.js';
import { createPrivateWebSocketGateway } from './private/gateway.js';
import { createWebSocketGateway } from './ws/gateway.js';

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

const hub = new DepthHub(
  source,
  {
    depthLimit: env.WS_DEPTH_LIMIT,
    highWaterBytes: env.WS_HIGH_WATER_BYTES,
    maxLagTicks: env.WS_MAX_LAG_TICKS,
    maxConnections: env.WS_MAX_CONNECTIONS,
    marketsRefreshMs: env.WS_MARKETS_REFRESH_MS,
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

const poller = new DepthPoller(
  source,
  hub,
  { intervalMs: env.WS_POLL_INTERVAL_MS, depthLimit: env.WS_DEPTH_LIMIT, marketsRefreshMs: env.WS_MARKETS_REFRESH_MS },
  app.log,
);

registerRoutes(app, {
  hub,
  tradeHub,
  source,
  depthLimit: env.WS_DEPTH_LIMIT,
  serviceName: env.SERVICE_NAME,
  upstream: env.MATCHING_URL,
  enabled: isEnabled,
});

/**
 * The market list is fetched before the port opens, not lazily on the first
 * connection. A subscription is refused unless the market is on it, so a
 * gateway that has never fetched it would refuse every client and look like a
 * bug in the terminal rather than a boot ordering problem.
 *
 * A failure here is not fatal: svc-matching may simply be starting. The list
 * refreshes on a timer and a connection that misses triggers one refetch.
 */
await hub.refreshMarkets().catch((err: unknown) => {
  app.log.warn(
    { err: String(err), upstream: env.MATCHING_URL },
    'svc-ws: could not read the market list at boot — will retry on the timer',
  );
});

/**
 * Trade tape: subscribe to `orderFilled` if NATS is up. Depth must keep
 * working when the bus is down — a public book feed should not die because
 * JetStream hiccuped. `ownedStreams: []` — matching owns the stream.
 */
let bus: Awaited<ReturnType<typeof JetStreamEventBus.connect>> | null = null;
let tradeSub: Subscription | null = null;
let privateSub: Subscription | null = null;
let privateFillSub: Subscription | null = null;
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
  }
} catch (err) {
  app.log.warn(
    { err: String(err), nats: env.NATS_URL },
    'svc-ws: trade tape bus unavailable — depth still serves; trades will be empty until reconnect',
  );
  bus = null;
  tradeSub = null;
  privateSub = null;
  privateFillSub = null;
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
    depthLimit: env.WS_DEPTH_LIMIT,
    pollMs: env.WS_POLL_INTERVAL_MS,
    trades: tradeSub !== null,
    privateOrders: privateSub !== null && privateTokens !== null,
    enabled,
  },
  'svc-ws ready — depth + trade tape + private orders',
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
      if (bus) await bus.close().catch(() => undefined);
      await gateway.close('gateway shutting down');
      await privateGateway.close('gateway shutting down');
      await app.close();
      process.exit(0);
    })();
  });
}
