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
 * `internalServiceEnvSchema` is here for exactly one caller — svc-token's
 * `/internal/stake/:userId`, which is how a staked lobby knows who may sit down.
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

      /** XP for finishing a path at all (§XIII certifications → perks). */
      ACADEMY_CERT_XP_BASE: z.coerce.number().int().min(0).max(100_000).default(250),

      /** XP per item in it, so a longer path is worth more. */
      ACADEMY_CERT_XP_PER_ITEM: z.coerce.number().int().min(0).max(10_000).default(25),

      /**
       * Hard ceiling on a lobby, above whatever a room asks for.
       *
       * A room's own `capacity` is the product decision; this is the operational
       * one. Presence fans out over svc-ws, and a room configured with a
       * capacity of fifty thousand would take the gateway down rather than fill
       * up.
       */
      ACADEMY_MAX_ROOM_CAPACITY: z.coerce.number().int().min(1).max(100_000).default(5_000),
    }),
  );

export const env = loadEnv(schema);
export type Env = typeof env;
