import { z } from 'zod';
import { edgeEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';

/**
 * svc-support — no database, no ledger, no internal service secret.
 * Stage-1 in-memory store. Edge principal secret only.
 */
const schema = serviceEnvSchema.merge(edgeEnvSchema).merge(
  z.object({
    HTTP_PORT: z.coerce.number().int().positive().default(4017),
  }),
);

export type SupportEnv = z.infer<typeof schema>;
export const env: SupportEnv = loadEnv(schema);
