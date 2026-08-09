import { z } from 'zod';
import { edgeEnvSchema, internalServiceEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';

/**
 * svc-market environment.
 *
 * This service self-mounts /trpc, so it must be able to authenticate the edge:
 * every procedure resolves `ctx.principal.userId` into somebody's vendor
 * application, and an unsigned principal header would let a caller apply as, or
 * vet, anyone (docs/decisions/mount-boundary.md).
 *
 * `internalServiceEnvSchema` arrived with Stage 2, for exactly ONE callee:
 * svc-token's `/internal/stake/:userId`, which is how a listing slot knows what
 * the caller's stake tier entitles them to. Stage 1's comment here said it would
 * arrive "when stake-gated slots need token.stakeOf" — this is that.
 *
 * `INTERNAL_SERVICE_SECRET` has no default, so a container started without it
 * dies at import rather than serving slot claims it cannot gate. Its wiring in
 * `docker-compose.apps.yml` is what `tooling/ci/compose-secret-parity.mjs`
 * checks, and the svc-academy block there records why that gate exists.
 *
 * `LEDGER_URL` arrived with market.commerce. Vendors still move no value; only
 * the purchase path posts recipes. `MARKET_HOUSE_COMMISSION_BPS` has NO default —
 * unset means refuse-closed (`market.commission_not_configured`). Setting `0` is
 * an explicit free-commission decision by the owner, not silence.
 */
const schema = serviceEnvSchema
  .merge(edgeEnvSchema)
  .merge(internalServiceEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-market'),
      /** 4018: every port from 4000 to 4017 is claimed in docker-compose.apps.yml. */
      HTTP_PORT: z.coerce.number().int().positive().default(4018),

      /** svc-token's internal address — the source of `vendorSlots` for listing slots. */
      TOKEN_URL: z.string().url().default('http://localhost:4003'),

      /** svc-ledger — purchase settlement only. */
      LEDGER_URL: z.string().url().default('http://localhost:4001'),

      /**
       * House commission in basis points (0..9999). Optional on purpose:
       * missing → refuse every purchase. Do not invent a platform rate.
       */
      MARKET_HOUSE_COMMISSION_BPS: z.preprocess(
        (v) => (v === undefined || v === null || v === '' ? undefined : v),
        z.coerce.number().int().min(0).max(9_999).optional(),
      ),
    }),
  );

export type MarketEnv = z.infer<typeof schema>;
export const env: MarketEnv = loadEnv(schema);
