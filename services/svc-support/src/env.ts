import { z } from 'zod';
import { edgeEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';

/**
 * svc-support — durable tickets in Postgres (schema `support`).
 * DATABASE_URL is required (serviceEnvSchema) so the desk survives restarts
 * and multi-replica claims stay exclusive. No ledger. No internal service secret.
 */
const schema = serviceEnvSchema.merge(edgeEnvSchema).merge(
  z.object({
    HTTP_PORT: z.coerce.number().int().positive().default(4017),
  }),
);

export type SupportEnv = z.infer<typeof schema>;
export const env: SupportEnv = loadEnv(schema);
