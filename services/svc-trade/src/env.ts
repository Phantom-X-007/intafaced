import { loadEnv } from '@intafaced/config';
import { envSchema } from './env-schema.js';

/**
 * The parsed environment for this process.
 *
 * The schema itself lives in `env-schema.ts` and is re-exported here so every
 * existing `from './env.js'` import keeps working. Parsing happens at module
 * scope, deliberately: a service with a broken environment should say so on the
 * first line rather than on the first request.
 */
export { envSchema };
export const env = loadEnv(envSchema);
export type Env = typeof env;
