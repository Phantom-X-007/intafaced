import { z } from 'zod';
import { baseEnvSchema, httpEnvSchema, loadEnv, otelEnvSchema } from '@intafaced/config';

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
 *   · **no `EDGE_PRINCIPAL_SECRET`.** Nothing here is scoped to a principal.
 *     A key that verifies "who is calling" is dead weight on a surface where
 *     the answer is always "anyone".
 *   · **no `DATABASE_URL`.** Depth is derived, never stored. The engine's book
 *     is the truth; a table here would be a second one.
 *   · **no `NATS_URL`.** This service publishes no subject and consumes none.
 *     It could not reconstruct a book from the bus if it wanted to —
 *     `intafaced.matching.order.accepted` carries `{orderId, marketId,
 *     sequence}` and no side, price or quantity (packages/events/src/catalog.ts).
 *     Widening that payload is a contracts PR (§15.2) and belongs in its own
 *     review, not smuggled into a service PR.
 *   · **no `REDIS_URL`.** One replica holds one book per subscribed market, in
 *     memory, and drops it when the last subscriber leaves. Sharing that across
 *     replicas would be a cache of a cache of the engine.
 */
const schema = baseEnvSchema
  .merge(otelEnvSchema)
  .merge(httpEnvSchema)
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
