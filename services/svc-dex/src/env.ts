import { z } from 'zod';
import { baseEnvSchema, edgeEnvSchema, httpEnvSchema, loadEnv, otelEnvSchema } from '@intafaced/config';

/**
 * svc-dex environment.
 *
 * **No `DATABASE_URL` and no `INTERNAL_SERVICE_SECRET`, deliberately.**
 *
 * The Protocol Plane holds no balances of ours: state lives on chain and is
 * projected into read models by svc-indexer. A database here would eventually
 * hold a position, and a position we hold is custody (Doctrine §16.10).
 *
 * The internal service secret is what lets a service call `ledger.post`.
 * Withholding it means a bug in this service cannot become a ledger write even
 * if someone imports the wrong module — `custody-scan` catches the import, and
 * the missing secret catches anything that slips past it.
 */
const schema = baseEnvSchema
  .merge(httpEnvSchema)
  .merge(otelEnvSchema)
  .merge(edgeEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-dex'),
      HTTP_PORT: z.coerce.number().int().default(4013),

      /** Read models. Quotes are served from projections, never from a chain call. */
      INDEXER_URL: z.string().url().default('http://localhost:4012'),
      /** The internal CLOB, quoted as one venue among several. */
      MATCHING_URL: z.string().url().default('http://localhost:4004'),

      /**
       * Quote staleness ceiling. A router that acts on an old quote routes to a
       * price that no longer exists — which looks to the user like the venue
       * lied to them.
       */
      QUOTE_MAX_AGE_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
    }),
  );

export const env = loadEnv(schema);
export type DexEnv = typeof env;
