import { z } from 'zod';
import { baseEnvSchema, edgeEnvSchema, httpEnvSchema, loadEnv, otelEnvSchema } from '@intafaced/config';

/**
 * svc-edge environment.
 *
 * Composed from slices rather than `serviceEnvSchema`, and the omissions are
 * the point: **no `DATABASE_URL`, no `NATS_URL`, no `INTERNAL_SERVICE_SECRET`.**
 *
 * The edge owns no data and publishes no events — it verifies a token and
 * forwards a request. Giving it a database would eventually give it a table,
 * and giving it the service secret would let a compromised edge call
 * `ledger.post` directly rather than merely proxying to something that can.
 * The blast radius of the internet-facing component should be the smallest in
 * the fleet, and that is a property of what it is allowed to hold.
 */
const schema = baseEnvSchema
  .merge(httpEnvSchema)
  .merge(otelEnvSchema)
  // Signs the principal it forwards. Same value as every mounted service.
  .merge(edgeEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-edge'),
      HTTP_PORT: z.coerce.number().int().default(4000),

      /**
       * Verifies the bearer token svc-identity issued. Must match
       * svc-identity's `JWT_ACCESS_SECRET` — a mismatch means every login
       * succeeds and every subsequent request is anonymous, which presents as
       * "logged in but nothing works".
       */
      JWT_ACCESS_SECRET: z.string().min(32),
      JWT_ISSUER: z.string().default('intafaced'),
      JWT_AUDIENCE: z.string().default('intafaced'),
      JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),

      /**
       * Jurisdiction region, resolved server-side.
       *
       * `XX` is the deliberate default: it is the region the matrix treats as
       * unknown, so a deployment that forgets to configure this is restrictive
       * rather than permissive. A wrong-but-open default would let a caller
       * reach modules their actual jurisdiction forbids.
       */
      DEFAULT_REGION: z.string().length(2).default('XX'),

      /** Upstream timeout. A hung service must not hold an edge connection open. */
      UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),

      /**
       * Where to exchange long-lived API keys (`ifc_…`) for short-lived JWTs.
       * Direct to svc-identity — never loop back through this edge (recursion).
       * Matches routes.ts IDENTITY_URL default.
       */
      IDENTITY_URL: z.string().url().default('http://localhost:4002'),

      /**
       * svc-ledger's OPERATOR surface, for `/admin/ledger/*` (§14.6).
       *
       * A URL, not a credential — which is why it does not violate the rule at
       * the top of this file. The edge holds no secret of the ledger's and
       * cannot post to the money plane; it forwards the operator's own bearer
       * token to two named paths, and svc-ledger verifies it independently.
       * `/api/ledger` is still deliberately absent from the route table.
       *
       * Optional. Unset means the console is told the money-plane control is
       * unreachable, which is the honest answer and not the same as reporting
       * the platform healthy.
       */
      LEDGER_URL: z.string().url().optional(),
    }),
  );

export const env = loadEnv(schema);
export type EdgeEnv = typeof env;
