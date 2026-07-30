import { z } from 'zod';
import { baseEnvSchema, httpEnvSchema, loadEnv, natsEnvSchema, otelEnvSchema } from '@intafaced/config';

/**
 * svc-ws environment.
 *
 * READ THE OMISSIONS FIRST — they are the security argument for this service
 * existing at all:
 *
 *   · **no `INTERNAL_SERVICE_SECRET`.** This is the one internet-facing socket
 *     in the fleet besides svc-edge, and it is unauthenticated by design (§9:
 *     public market data). A process that accepts anonymous connections must
 *     not also hold the credential that opens `ledger.post` and
 *     `matching.submit`. svc-matching's depth read needs no credential, so
 *     there is nothing here to take.
 *   · **no `EDGE_PRINCIPAL_SECRET`.** The public port is not principal-scoped.
 *     Optional `JWT_ACCESS_SECRET` is ONLY for `/private/stream` order
 *     lifecycle (same secret as identity/edge). Public `/stream` never reads it.
 *   · **no `DATABASE_URL`.** Depth and the trade tape are derived, never
 *     stored. The engine's book and the bus are the truth.
 *   · **no `REDIS_URL`.** One replica holds one book per subscribed market, in
 *     memory, and drops it when the last subscriber leaves. Sharing that across
 *     replicas would be a cache of a cache of the engine.
 *
 * `NATS_URL` is present for the public trade tape only: this process
 * subscribes to `orderFilled` and re-broadcasts a stripped print. That is not
 * a money path and not a principal path — order ids never leave the bus-side
 * handler. Depth still works if the bus is down; trades degrade.
 */
const schema = baseEnvSchema
  .merge(otelEnvSchema)
  .merge(httpEnvSchema)
  .merge(natsEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-ws'),
      /** 4014: every port from 4000 to 4013 is taken by another service. */
      HTTP_PORT: z.coerce.number().int().default(4014),

      /**
       * svc-matching's HTTP base. Reads there are deliberately unauthenticated
       * (`services/svc-matching/src/router.ts` — "Reads stay open: depth and the
       * market list are public market data, and a price is not a secret"), which
       * is exactly why this service can talk to it holding no secret.
       */
      MATCHING_URL: z.string().url().default('http://localhost:4005'),

      /**
       * How deep the stream goes, per side.
       *
       * The snapshot AND every delta describe the same top-N window, so a level
       * pushed out of the window arrives as a removal and the client's book
       * stays exactly this deep. A client that wants more depth than this is
       * asking for a different product, not a bigger number.
       */
      WS_DEPTH_LIMIT: z.coerce.number().int().min(1).max(500).default(50),

      /**
       * Poll cadence against svc-matching.
       *
       * Polling, not a push, because §5.1 gives the engine no outbound depth
       * feed and adding one is a change to svc-matching — a separate PR, and
       * arguably a separate design (the README's `SnapshotSink` socket is where
       * it would land). The cost of polling is bounded and visible: one HTTP
       * GET per subscribed market per tick, and markets with no subscriber are
       * not polled at all.
       */
      WS_POLL_INTERVAL_MS: z.coerce.number().int().min(50).max(60_000).default(250),

      /** How often the cached market list is refreshed from `GET /markets`. */
      WS_MARKETS_REFRESH_MS: z.coerce.number().int().min(1_000).max(600_000).default(30_000),

      /**
       * Outbound socket buffer above which a client is considered lagging.
       *
       * See `depth/hub.ts` for the policy this number drives. It is bytes
       * already handed to the kernel and not yet drained, not a queue we keep —
       * this service keeps no per-client replay queue at all.
       */
      WS_HIGH_WATER_BYTES: z.coerce.number().int().min(4_096).default(1_048_576),

      /**
       * Consecutive ticks a client may spend above the high-water mark before
       * it is disconnected. At the default cadence that is ~5 seconds of a
       * socket that cannot absorb a 50-level book.
       */
      WS_MAX_LAG_TICKS: z.coerce.number().int().min(1).default(20),

      /** Sockets per replica. A public port needs a ceiling that is not RAM. */
      WS_MAX_CONNECTIONS: z.coerce.number().int().min(1).default(5_000),

      /** Ping cadence. A socket that misses a pong is dead and is terminated. */
      WS_HEARTBEAT_MS: z.coerce.number().int().min(1_000).default(30_000),

      /**
       * How many recent public prints to keep per market and replay on a new
       * tape subscription. Bound is memory, not correctness — a client that
       * wants history longer than this asks a different product.
       */
      WS_TRADE_RECENT_LIMIT: z.coerce.number().int().min(0).max(1_000).default(50),

      /**
       * JetStream durable for the `orderFilled` consumer. Must be unique per
       * replica when more than one svc-ws instance should each receive every
       * fill (JetStream durables are exclusive).
       */
      WS_TRADES_DURABLE: z.string().min(1).max(128).default('ws-trade-tape'),

      /**
       * Optional. When set, `/private/stream` accepts `access_token` and fans
       * `orderUpdated` to that user. When unset, private upgrades return 403 —
       * public market data is unaffected.
       */
      JWT_ACCESS_SECRET: z.string().min(32).optional(),
      JWT_ISSUER: z.string().default('intafaced'),
      JWT_AUDIENCE: z.string().default('intafaced'),
      WS_PRIVATE_ORDERS_DURABLE: z.string().min(1).max(128).default('ws-private-orders'),

      /**
       * Kill-switch, mirroring the `ws.gateway` flag. When false the service
       * still answers `/health` (so an operator can see the process is alive)
       * but refuses upgrades, closes open sockets, and `/ready` returns 503 so
       * the load balancer takes it out of rotation.
       */
      WS_GATEWAY_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(true)
        .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase()))),
    }),
  );

export const env = loadEnv(schema);
export type Env = typeof env;
