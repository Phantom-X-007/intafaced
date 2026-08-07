/**
 * svc-trade's environment SCHEMA, with no side effect on import.
 *
 * Split out of `env.ts` so a test can ask "would this environment boot?" without
 * `loadEnv(process.env)` running first and answering a different question. That
 * distinction is not academic: svc-trade crash-looped on the configuration this
 * repo ships (see `boot-config.test.ts`), and the file that would have caught it
 * could not import the schema without triggering the very failure it wanted to
 * measure.
 */
import { z } from 'zod';
import { edgeEnvSchema, internalServiceEnvSchema, serviceEnvSchema } from '@intafaced/config';

// Both, and they are not alternatives. `edgeEnvSchema` authenticates the USER a
// request claims to carry; `internalServiceEnvSchema` authenticates the SERVICE
// making the call. A mounted money service needs both — see #50.
/**
 * Exported so a test can parse an environment that is NOT `process.env` — in
 * particular the one a clean clone actually hands this container. svc-trade has
 * already crash-looped once on shipped config, and what the schema accepts is
 * half of what decides whether it will again. See `boot-config.test.ts`.
 */
export const envSchema = serviceEnvSchema
  .merge(edgeEnvSchema)
  .merge(internalServiceEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-trade'),
      HTTP_PORT: z.coerce.number().int().default(4004),

      /** svc-ledger's internal address. All value movement goes through it. */
      LEDGER_URL: z.string().url().default('http://localhost:4001'),

      /** svc-identity — rank perks at order accept + sub-account ownership gate. */
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

      /**
       * Futures residual jobs (liquidation scan + funding ticks).
       * Default OFF — must be explicitly enabled. Never invents markets/rates.
       */
      TRADE_FUTURES_JOBS_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(false)
        .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'on', 'yes'].includes(v.toLowerCase()))),

      /** Liquidation scan interval when jobs enabled. Default 15s. */
      TRADE_FUTURES_LIQ_INTERVAL_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(15_000),

      /** Funding tick interval per market when jobs enabled. Default 8h. */
      TRADE_FUTURES_FUNDING_INTERVAL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(28_800_000),

      /**
       * Comma-separated market UUIDs for funding ticks.
       * Empty (default) = funding jobs not scheduled — never invent market list.
       */
      TRADE_FUTURES_FUNDING_MARKET_IDS: z.string().default(''),

      /**
       * THE ACCOUNT REALISED FUTURES PROFIT IS PAID FROM, and therefore the
       * ceiling on what a winning position can be paid.
       *
       * `ownerType:ownerId:kind[:purpose]`, e.g. `house:fees:trade:available`.
       *
       * NO DEFAULT, and that is the decision. `futuresRealizeProfit` used to
       * draw on a fee pot with no ceiling — a house account is not an insurance
       * fund and a fee balance is not a risk budget. Which account funds profit,
       * and how it is capitalised, is a fee and revenue recipe and an owner
       * decision (`docs/adr/2026-08-05-futures-risk-and-mark-law.md`,
       * `DIRECTION` §8 item 6). A default here would BE that decision, made
       * silently by whoever wrote this line.
       *
       * Unset, the service refuses to boot rather than picking a pot. See
       * `futures/profit-source.ts`.
       */
      TRADE_FUTURES_PROFIT_SOURCE: z.string().default(''),

      /**
       * Market-maker seed job (trade.mm-bot residual).
       * Default OFF — ops must enable + fund pot + set markets + mids.
       * Never invents mid or market list.
       */
      TRADE_MM_SEED_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(false)
        .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'on', 'yes'].includes(v.toLowerCase()))),

      /** Seed scan interval when enabled. Default 60s. */
      TRADE_MM_SEED_INTERVAL_MS: z.coerce.number().int().min(5_000).max(3_600_000).default(60_000),

      /**
       * Explicit seed targets: `marketId:base:quote,...`
       * Empty (default) = job not scheduled even when enabled.
       */
      TRADE_MM_SEED_MARKETS: z.string().default(''),

      /**
       * External mids for seed: `marketId:mid,...`
       * Missing mid for a market → skip that market (never invent).
       */
      TRADE_MM_SEED_MIDS: z.string().default(''),

      /**
       * When true, after env mid map miss, try public venue book mid
       * (same venue id + symbol map as TRADE_VENUE_MARK_*). Default OFF.
       * Never invents if venue down / unmapped / empty book.
       */
      TRADE_MM_SEED_MID_FROM_VENUE: z
        .union([z.boolean(), z.string()])
        .default(false)
        .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'on', 'yes'].includes(v.toLowerCase()))),

      TRADE_MM_SEED_HALF_SPREAD_BPS: z.coerce.number().int().min(0).max(5_000).default(10),
      TRADE_MM_SEED_STEP_BPS: z.coerce.number().int().min(0).max(5_000).default(10),
      TRADE_MM_SEED_LEVELS: z.coerce.number().int().min(1).max(50).default(3),
      TRADE_MM_SEED_QTY: z.string().default('1'),

      /**
       * Durable last-run map for MM seed cancel/reseed across process restarts.
       * Empty = in-memory only (legacy). Relative paths resolve from process cwd.
       */
      TRADE_MM_SEED_STATE_PATH: z.string().default('.data/mm-seed-last-run.json'),

      /**
       * Venue fabric mark source (A-TRADE-VENUE-1 / venue.aggregation).
       * Empty (default) = off — marks fall back to matching depth mid only.
       * Known id today: `binance-spot` (public MarketDataAdapter, no keys).
       * Unknown id → no adapter (refuse invent). Never invents mid.
       */
      TRADE_VENUE_MARK_VENUE: z.string().default(''),

      /**
       * Map our market UUIDs to venue unified symbols for the mark port:
       * `marketId:BTC/USDT,other:ETH/USDT`.
       * Unmapped market → null mark for that id (never invent symbol).
       */
      TRADE_VENUE_MARK_SYMBOLS: z.string().default(''),

      /**
       * Spot candle materialization job (A-TRADE-SPOT-1).
       * Default OFF — REST OHLCV always reads live fills; this job only
       * copies closed non-seeded buckets into trade.spot_candles.
       * Never invents empty candles or a market list.
       */
      TRADE_CANDLE_JOBS_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(false)
        .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'on', 'yes'].includes(v.toLowerCase()))),

      /** Materialization tick interval when enabled. Default 60s. */
      TRADE_CANDLE_JOBS_INTERVAL_MS: z.coerce.number().int().min(5_000).max(3_600_000).default(60_000),

      /**
       * Comma-separated market UUIDs to materialize.
       * Empty (default) = job not scheduled even when enabled.
       */
      TRADE_CANDLE_JOBS_MARKET_IDS: z.string().default(''),

      /**
       * Comma-separated timeframes (e.g. `1m,1h`). Invalid tokens dropped.
       * Empty → `1m` only when markets are set.
       */
      TRADE_CANDLE_JOBS_TIMEFRAMES: z.string().default('1m'),
    }),
  );
