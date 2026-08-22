import { z } from 'zod';
import { baseEnvSchema, edgeEnvSchema, httpEnvSchema, loadEnv, otelEnvSchema } from '@intafaced/config';

/**
 * svc-execution — house-tenant mechanism + OMS plan/execute (D26-P1-X3).
 *
 * No Postgres: the sealed registry is in-process. No REDIS/NATS/DATABASE_URL —
 * this process holds no balances (Doctrine §0.6). House fills would use
 * `packages/ledger-client` recipes later; this service does not invent accounts.
 *
 * External spot trade adapters wire when `EXECUTION_VENUE_IDS` lists a known
 * public spot id and matching `EXECUTION_VENUE_<ID>_API_KEY` / `_API_SECRET`
 * (optional `_PASSPHRASE` for okx-spot) are set. Unset → refuse-closed.
 *
 * HTTP_PORT 4019: 4000–4018 are taken by the existing fleet.
 */
/** Compose interpolates unset optional URLs to "". Blank is absent, not an invalid URL. */
const blankAsAbsent = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), inner);

const schema = baseEnvSchema
  .merge(otelEnvSchema)
  .merge(httpEnvSchema)
  .merge(edgeEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-execution'),
      HTTP_PORT: z.coerce.number().int().positive().default(4019),
      /**
       * Comma-separated signed spot venue ids for OMS execute/cancel/fetch/openOrders.
       * Empty (default) = no external trade adapters mounted.
       * Known ids: `binance-spot`, `bybit-spot`, `okx-spot`.
       * Unknown id or unset credentials → venue skipped (refuse-closed at call).
       */
      EXECUTION_VENUE_IDS: z.string().default(''),
      /**
       * svc-trade base for OMS book snapshot on venue `intafaced-spot`
       * (`GET /api/v1/orderbook/:symbol`). Unset / blank → snapshot map empty.
       */
      TRADE_URL: blankAsAbsent(z.string().url().optional()),
      /**
       * JSONL path for durable EMS ack journal. Blank (default) → in-memory store.
       */
      EXECUTION_EMS_STORE_PATH: z.string().default(''),
    }),
  );

export type ExecutionEnv = z.infer<typeof schema>;
export const env: ExecutionEnv = loadEnv(schema);
