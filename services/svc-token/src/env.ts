import { z } from 'zod';
import { edgeEnvSchema, internalServiceEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';

// Self-mounts /trpc — must authenticate the edge principal. And it CALLS
// svc-ledger, so it must also identify itself as a service. The two are
// orthogonal: one says which user, the other says which service (#50).
const schema = serviceEnvSchema
  .merge(edgeEnvSchema)
  .merge(internalServiceEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-token'),
      HTTP_PORT: z.coerce.number().int().default(4003),

      /** The native asset. Configurable so a testnet can run its own symbol. */
      TOKEN_ASSET_ID: z.string().default('IFC'),

      /** svc-ledger's internal address. All value movement goes through it. */
      LEDGER_URL: z.string().url().default('http://localhost:4001'),

      /**
       * Emergency stop for minting. §4.3 makes this service the only minter, so
       * this switch is the only thing between a mis-tuned curve and permanent
       * supply inflation — and inflation cannot be un-minted.
       */
      EMISSIONS_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(true)
        .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase()))),

      /** Real-yield distribution cadence. §4.3 specifies weekly. */
      YIELD_DISTRIBUTION_CRON_HOURS: z.coerce.number().int().min(1).default(168),
    }),
  );

export const env = loadEnv(schema);
export type Env = typeof env;
