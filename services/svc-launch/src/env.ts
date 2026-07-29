import { z } from 'zod';
import { edgeEnvSchema, internalServiceEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';

/**
 * svc-launch environment.
 *
 * This service self-mounts /trpc, so it must be able to authenticate the edge:
 * every procedure resolves `ctx.principal.userId` into somebody's commitments,
 * allocations and vesting claims, and an unsigned principal header would let a
 * caller name any of them (docs/decisions/mount-boundary.md).
 *
 * It also merges `internalServiceEnvSchema`, for two different reasons: it
 * calls svc-ledger (which is the only way it can move value at all) and it
 * calls svc-token's `/internal/stake/:userId` to resolve allocation tiers.
 */
const schema = serviceEnvSchema
  .merge(edgeEnvSchema)
  .merge(internalServiceEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-launch'),
      /** 4015: every port from 4000 to 4014 is claimed in docker-compose.apps.yml. */
      HTTP_PORT: z.coerce.number().int().default(4015),

      /** svc-ledger's internal address. ALL value movement goes through it (§0.6). */
      LEDGER_URL: z.string().url().default('http://localhost:4001'),

      /**
       * svc-token's internal address — the source of `stakeOf` for allocation
       * tiers (§8.4).
       *
       * There is no "assume zero stake" fallback, deliberately. A raise whose
       * tiers silently collapse to the lowest gate while svc-token is
       * unreachable would sell a staked allocation to someone who does not hold
       * the stake, and unwinding that means asking people to give tokens back.
       * The commit is refused instead: nothing has moved at that point, which is
       * exactly why it is the right place to be strict.
       */
      TOKEN_URL: z.string().url().default('http://localhost:4003'),

      /**
       * Smallest commitment the platform will escrow, in the raise's payment
       * asset. Guards against dust commitments whose per-contributor settlement
       * transaction costs more to post than the contribution is worth.
       */
      LAUNCH_MIN_CONTRIBUTION: z.string().default('0.000000000000000001'),

      /**
       * How many contributors one settlement pass handles.
       *
       * Settlement is per-contributor and resumable, so this is a blast-radius
       * bound rather than a correctness one: a bad pass touches at most this
       * many people before an operator can stop it.
       */
      LAUNCH_SETTLE_BATCH_SIZE: z.coerce.number().int().min(1).max(10_000).default(200),
    }),
  );

export const env = loadEnv(schema);
export type Env = typeof env;
