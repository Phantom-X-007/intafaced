import { z } from 'zod';
import { edgeEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';

/**
 * svc-market environment.
 *
 * This service self-mounts /trpc, so it must be able to authenticate the edge:
 * every procedure resolves `ctx.principal.userId` into somebody's vendor
 * application, and an unsigned principal header would let a caller apply as, or
 * vet, anyone (docs/decisions/mount-boundary.md).
 *
 * THERE IS NO `LEDGER_URL` AND NO `INTERNAL_SERVICE_SECRET`, and both absences
 * are the design:
 *
 *   · No ledger client. `market.vendors` moves no value at all — purchases and
 *     house commission are `market.commerce` (§0.6). This process holds no
 *     credential that could reach anything which moves value.
 *   · No internal service secret. Stage 1 calls nobody. `TOKEN_URL` arrives with
 *     Stage 2, when stake-gated slots need `token.stakeOf`; adding it now would
 *     be a boot dependency that can fail in exchange for no capability.
 */
const schema = serviceEnvSchema.merge(edgeEnvSchema).merge(
  z.object({
    SERVICE_NAME: z.string().default('svc-market'),
    /** 4018: every port from 4000 to 4017 is claimed in docker-compose.apps.yml. */
    HTTP_PORT: z.coerce.number().int().positive().default(4018),
  }),
);

export type MarketEnv = z.infer<typeof schema>;
export const env: MarketEnv = loadEnv(schema);
