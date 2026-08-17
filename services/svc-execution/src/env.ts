import { z } from 'zod';
import { baseEnvSchema, edgeEnvSchema, httpEnvSchema, loadEnv, otelEnvSchema } from '@intafaced/config';

/**
 * svc-execution — Stage-1 house-tenant mechanism only.
 *
 * No Postgres: the sealed registry is in-process. No REDIS/NATS/DATABASE_URL —
 * this process holds no balances (Doctrine §0.6). House fills would use
 * `packages/ledger-client` recipes later; this service does not invent accounts.
 *
 * HTTP_PORT 4019: 4000–4018 are taken by the existing fleet.
 */
const schema = baseEnvSchema
  .merge(otelEnvSchema)
  .merge(httpEnvSchema)
  .merge(edgeEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-execution'),
      HTTP_PORT: z.coerce.number().int().positive().default(4019),
    }),
  );

export type ExecutionEnv = z.infer<typeof schema>;
export const env: ExecutionEnv = loadEnv(schema);
