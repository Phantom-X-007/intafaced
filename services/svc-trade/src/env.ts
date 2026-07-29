import { z } from 'zod';
import { edgeEnvSchema, internalServiceEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';

// Both, and they are not alternatives. `edgeEnvSchema` authenticates the USER a
// request claims to carry; `internalServiceEnvSchema` authenticates the SERVICE
// making the call. A mounted money service needs both — see #50.
const schema = serviceEnvSchema
  .merge(edgeEnvSchema)
  .merge(internalServiceEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-trade'),
      HTTP_PORT: z.coerce.number().int().default(4004),

      /** svc-ledger's internal address. All value movement goes through it. */
      LEDGER_URL: z.string().url().default('http://localhost:4001'),

      /** svc-identity — read only, and only for `rank.perks.feeDiscountBps`. */
      IDENTITY_URL: z.string().url().default('http://localhost:4002'),

      /** svc-matching — the book. This service never runs one of its own. */
      MATCHING_URL: z.string().url().default('http://localhost:4005'),

      /**
       * Kill-switch mirror of the `trade.spot` flag (§14 admin controls).
       *
       * OFF stops NEW orders. It deliberately does not stop cancellations: an
       * operator halting the market must be able to let users out of their
       * positions, and a switch that traps funds is not a safety control.
       */
      TRADE_SPOT_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(true)
        .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase()))),

      /**
       * Worst price a market BUY may be funded at, above the best ask.
       *
       * A market buy has no price, so there is no honest amount to hold for it
       * until one is chosen. This is that choice: the order is funded at
       * `bestAsk x (1 + cap)` and submitted to the engine as a marketable IOC
       * LIMIT at exactly that price, so the engine physically cannot fill it above
       * what was held. 200 bps = 2%.
       */
      TRADE_MARKET_SLIPPAGE_CAP_BPS: z.coerce.number().int().min(1).max(5000).default(200),

      /** Kill-switch for one-tap Convert (`trade.convert`). */
      TRADE_CONVERT_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(true)
        .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase()))),

      /**
       * House edge shown on convert RFQs, in bps of book notional.
       * Execution still settles through the normal market IOC money path.
       */
      TRADE_CONVERT_SPREAD_BPS: z.coerce.number().int().min(0).max(5000).default(10),
    }),
  );

export const env = loadEnv(schema);
export type Env = typeof env;
