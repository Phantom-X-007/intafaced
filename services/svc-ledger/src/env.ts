import { z } from 'zod';
import { internalServiceEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';

// svc-ledger SERVES the internal money plane, so it must be able to
// authenticate the services calling it. No default: a ledger that cannot tell
// a caller from a stranger must refuse to boot (#50).
const schema = serviceEnvSchema.merge(internalServiceEnvSchema).merge(
  z.object({
    SERVICE_NAME: z.string().default('svc-ledger'),
    HTTP_PORT: z.coerce.number().int().default(4001),

    /** Reconciliation cadence. §4.2 specifies hourly snapshots. */
    RECONCILE_CRON_MINUTES: z.coerce.number().int().min(1).default(60),

    /**
     * Emergency freeze. When false, every `post` is refused.
     *
     * This is the most consequential switch in the platform and it exists
     * because §4.2 requires it: on a reconciliation mismatch the diverging
     * module is frozen rather than allowed to keep writing to a book we no
     * longer trust.
     */
    LEDGER_POSTING_ENABLED: z
      .union([z.boolean(), z.string()])
      .default(true)
      .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase()))),
  }),
);

export const env = loadEnv(schema);
export type Env = typeof env;
