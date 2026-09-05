import { z } from 'zod';
import { edgeEnvSchema, internalServiceEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';

// Self-mounts /trpc — must authenticate the edge principal. And it CALLS
// svc-ledger, so it must also identify itself as a service. The two are
// orthogonal: one says which user, the other says which service (#50).
const schema = serviceEnvSchema
  .merge(edgeEnvSchema)
  .merge(internalServiceEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-token'),
      HTTP_PORT: z.coerce.number().int().default(4003),

      /** The native asset. Configurable so a testnet can run its own symbol. */
      TOKEN_ASSET_ID: z.string().default('IFC'),

      /** svc-ledger's internal address. All value movement goes through it. */
      LEDGER_URL: z.string().url().default('http://localhost:4001'),

      /**
       * Emergency stop for minting. §4.3 makes this service the only minter, so
       * this switch is the only thing between a mis-tuned curve and permanent
       * supply inflation — and inflation cannot be un-minted.
       *
       * Gates both the `mintEpoch` tRPC procedure and the optional auto-tick.
       */
      EMISSIONS_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(true)
        .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase()))),

      /**
       * When true, svc-token mints the next sequential epoch on an interval.
       * Default OFF: minting is operator/cron-driven via `mintEpoch` so a
       * redeploy cannot silently open the faucet. Prefer an external cron
       * calling `mintEpoch` (admin:treasury) when possible — an in-process
       * timer is invisible to operators (see svc-bank's job endpoints).
       */
      EMISSIONS_AUTO_TICK: z
        .union([z.boolean(), z.string()])
        .default(false)
        .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'on', 'yes'].includes(v.toLowerCase()))),

      /**
       * Auto-tick interval in ms. No default — `86400000` is a live 1-day
       * magnitude; blank / missing is `token.emissions_tick_unset` when
       * auto-tick is on. Explicit `86400000` is owner-present. AUTO_TICK
       * default OFF does not excuse inventing the interval.
       */
      EMISSIONS_TICK_MS: z.string().optional(),

      /**
       * Weekly yield aggregation job. Default OFF: unset must refuse
       * `token.yield_job_unset` rather than invent fee totals. Host `.env`
       * turns it on; do not default true.
       */
      YIELD_JOB_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(false)
        .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'on', 'yes'].includes(v.toLowerCase()))),

      /**
       * Real-yield distribution cadence in hours. No default — `168` is a live
       * weekly magnitude; blank / missing is `token.yield_job_unset`. Explicit
       * `168` is owner-present. Never git-default a cron.
       */
      YIELD_DISTRIBUTION_CRON_HOURS: z.string().optional(),

      /**
       * Buyback market-buy job. Default OFF: unset must refuse
       * `token.buyback_job_unset` rather than invent a fill. Host `.env`
       * turns it on; do not default true.
       */
      BUYBACK_JOB_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(false)
        .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'on', 'yes'].includes(v.toLowerCase()))),

      /** svc-trade — public orderbook for buyback depth. Place is not this URL's user REST door. */
      TRADE_URL: z.string().url().default('http://localhost:4004'),

      /**
       * Internal-book symbol for the IOC market-buy. Blank is refuse-closed
       * (`token.buyback_job_unset`) — do not default a listing.
       */
      BUYBACK_SYMBOL: z.string().default(''),

      /**
       * Quote asset whose houseFees size the spend. Blank is refuse-closed —
       * do not default USDT.
       */
      BUYBACK_QUOTE_ASSET: z.string().default(''),

      /**
       * Owner quorum for `closeProposal`, in bps of active stake. No default —
       * blank / missing is `token.governance_quorum_unset`. Never invent a bar.
       */
      TOKEN_GOVERNANCE_QUORUM_BPS: z.string().optional(),

      /**
       * Owner for-threshold for `closeProposal`, in bps of (for+against).
       * Same blank-refuse as quorum. Explicit `0` is owner-present.
       */
      TOKEN_GOVERNANCE_THRESHOLD_BPS: z.string().optional(),
    }),
  );

export const env = loadEnv(schema);
export type Env = typeof env;
