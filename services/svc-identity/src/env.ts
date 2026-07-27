import { z } from 'zod';
import { authEnvSchema, edgeEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';

// Self-mounts /trpc — must authenticate the edge principal (see packages/contracts/src/edge.ts).
const schema = serviceEnvSchema
  .merge(authEnvSchema)
  .merge(edgeEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-identity'),
      HTTP_PORT: z.coerce.number().int().default(4002),
      /** Registration open? §11 gates this behind the drop sequence. */
      REGISTRATION_OPEN: z
        .union([z.boolean(), z.string()])
        .default(true)
        .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase()))),
    }),
  );

export const env = loadEnv(schema);
export type Env = typeof env;
