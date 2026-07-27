import { z } from 'zod';
import { baseEnvSchema, httpEnvSchema, loadEnv, natsEnvSchema, otelEnvSchema, redisEnvSchema } from '@intafaced/config';

/**
 * svc-matching environment.
 *
 * Composed from the slices rather than `serviceEnvSchema`, and the omission is
 * the point: **there is no `DATABASE_URL`.** §5.1 gives this service in-memory
 * books and an append-only journal, and nothing else. A service that demands a
 * database connection it never opens is a service someone will eventually give
 * a table to.
 */
const schema = baseEnvSchema
  .merge(redisEnvSchema)
  .merge(natsEnvSchema)
  .merge(otelEnvSchema)
  .merge(httpEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-matching'),
      HTTP_PORT: z.coerce.number().int().default(4004),

      /**
       * Where the append-only journal lives (§5.1). Every input lands here and
       * is fsync'd before the book moves, so a cold start replays to exactly
       * the state the process died in.
       */
      MATCHING_JOURNAL_PATH: z.string().min(1).default('./.data/matching/engine_journal.ndjson'),

      /** §5.1: "Snapshot every N events". 0 disables snapshotting. */
      MATCHING_SNAPSHOT_EVERY: z.coerce.number().int().min(0).default(500),

      /**
       * Kill-switch, mirroring the `matching.engine` flag. When false the
       * engine refuses submissions **before** journalling them — the journal
       * means "processed, in this order", and an input that was never processed
       * does not belong in it.
       */
      MATCHING_ENGINE_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(true)
        .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase()))),
    }),
  );

export const env = loadEnv(schema);
export type Env = typeof env;
