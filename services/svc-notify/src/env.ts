import { z } from 'zod';
import { edgeEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';

/**
 * svc-notify environment.
 *
 * Self-mounts /trpc, so it must authenticate the edge principal. No ledger
 * client, no INTERNAL_SERVICE_SECRET — this service never moves value and never
 * calls another service with a service credential.
 */

const bool = (defaultOn: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .default(defaultOn)
    .transform((v) =>
      typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(String(v).toLowerCase()),
    );

const schema = serviceEnvSchema.merge(edgeEnvSchema).merge(
  z.object({
    SERVICE_NAME: z.string().default('svc-notify'),
    HTTP_PORT: z.coerce.number().int().default(4015),

    /**
     * Fan-out kill-switch. When false, event consumers still ack but do not
     * insert inbox rows. Pairs with the `notify.fanout` feature flag.
     *
     * Push / email / SMS are §13 sockets — this switch only gates in-app
     * inserts. Turning it off is the operator stop for notification spam.
     */
    NOTIFY_FANOUT_ENABLED: bool(true),
  }),
);

export const env = loadEnv(schema);
export type Env = typeof env;
