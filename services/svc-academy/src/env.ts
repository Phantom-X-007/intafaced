import { z } from 'zod';
import { edgeEnvSchema, internalServiceEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';

/**
 * svc-academy environment.
 *
 * This service self-mounts /trpc, so it must be able to authenticate the edge:
 * every procedure resolves `ctx.principal.userId` into somebody's seat, their
 * progress or their certification, and an unsigned principal header would let a
 * caller claim any of them (docs/decisions/mount-boundary.md).
 *
 * `internalServiceEnvSchema` is here for exactly two callees, both of which
 * authenticate on the shared service secret:
 *
 *   · svc-token's `/internal/stake/:userId` — how a staked lobby knows who may
 *     sit down;
 *   · svc-identity's `/internal/rank/:userId/perks` — how the service knows who
 *     may open a room (§4.1 `lobbyHostRights`).
 *
 * There is no LEDGER_URL, and that absence is the design: `academy` is
 * `custodial: false` and this process holds no credential that could reach
 * anything which moves value.
 */
const schema = serviceEnvSchema
  .merge(edgeEnvSchema)
  .merge(internalServiceEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-academy'),
      /** 4016: every port from 4000 to 4015 is claimed in docker-compose.apps.yml. */
      HTTP_PORT: z.coerce.number().int().default(4016),

      /** svc-token's internal address — the source of `stakeOf` for staked lobbies. */
      TOKEN_URL: z.string().url().default('http://localhost:4003'),

      /**
       * svc-identity's internal address — the source of §4.1's
       * `rank_thresholds.perks.lobbyHostRights`, which decides who may open a
       * room at all. Read at `createRoom` and nowhere else (host-rights.ts).
       */
      IDENTITY_URL: z.string().url().default('http://localhost:4002'),

      /**
       * Which streaming provider carries live sessions.
       *
       * `none` runs lobbies as seats, presence and the 2D scene canvas with no
       * audio or video, and says so out loud rather than handing out a join
       * token that cannot connect (SOCKET §13 `socket.stream-provider`).
       *
       * Chosen explicitly, never by fallback: a misconfigured provider must
       * fail loudly instead of quietly degrading a paid lobby to text.
       */
      ACADEMY_STREAM_PROVIDER: z.enum(['none']).default('none'),

      /**
       * Hard ceiling on a lobby, above whatever a room asks for.
       *
       * A room's own `capacity` is the product decision; this is the operational
       * one. Presence fans out over svc-ws, and a room configured with a
       * capacity of fifty thousand would take the gateway down rather than fill
       * up.
       */
      ACADEMY_MAX_ROOM_CAPACITY: z.coerce.number().int().min(1).max(100_000).default(5_000),

      /**
       * Stage-1 tournament ladder kill-switch (mirrors flag `academy.tournament`).
       * When false, season/standing procedures refuse `academy.tournament_disabled`.
       */
      ACADEMY_TOURNAMENT_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(true)
        .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(String(v).toLowerCase()))),
    }),
  );

export const env = loadEnv(schema);
export type Env = typeof env;
