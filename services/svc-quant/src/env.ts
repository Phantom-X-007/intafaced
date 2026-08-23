import { z } from 'zod';
import { baseEnvSchema, edgeEnvSchema, httpEnvSchema, loadEnv, otelEnvSchema } from '@intafaced/config';

/**
 * svc-quant environment.
 *
 * No DATABASE_URL and no INTERNAL_SERVICE_SECRET: this process holds no
 * balances and cannot reach ledger.post. Paper book state lives for one run.
 *
 * QUANT_VENUE_VAULT is the Venue Vault trade-only pin. Blank = venue OMS
 * refuses `quant.venue_vault_unset`. Internal book still runs.
 */
const schema = baseEnvSchema
  .merge(httpEnvSchema)
  .merge(otelEnvSchema)
  .merge(edgeEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-quant'),
      HTTP_PORT: z.coerce.number().int().default(4021),

      SANDBOX_TIMEOUT_MS: z.coerce.number().int().min(50).max(10_000).default(500),
      SANDBOX_MAX_OPS: z.coerce.number().int().min(100).max(1_000_000).default(50_000),
      SANDBOX_MAX_SOURCE: z.coerce.number().int().min(32).max(64_000).default(8_000),

      /**
       * Venue Vault trade-only credential pin. Pass-through, no default.
       * Unset/blank → venue OMS refuses by name. Never invent a key.
       */
      QUANT_VENUE_VAULT: z
        .string()
        .optional()
        .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim())),
    }),
  );

export const env = loadEnv(schema);
export type QuantEnv = typeof env;
