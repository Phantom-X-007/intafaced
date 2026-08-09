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
       * Kill-switch for TWAP algo execution (D-S-04 / trade.algo).
       * OFF refuses new schedules; cancel/pause of existing still work.
       */
      TRADE_ALGO_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(true)
        .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase()))),

      /**
       * TWAP slice scheduler (D-S-04 / trade.algo). Default OFF.
       *
       * Distinct from TRADE_ALGO_ENABLED: that one decides whether a user may
       * CREATE a schedule, this one decides whether anything ever executes it.
       * Off, a TWAP is accepted, persisted, and never places a child — which is
       * exactly the pre-mount state, so this defaults off until an operator
       * turns it on deliberately (denylist: only 1/true/on/yes enable).
       *
       * Mount is legal only with ADR 2026-08-08 re-space + cancel honesty.
       */
      TRADE_ALGO_JOBS_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(false)
        .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'on', 'yes'].includes(v.toLowerCase()))),

      /**
       * How often the TWAP scheduler asks the engine for the next due slice.
       * Cap 1000ms: the engine's floor for sliceIntervalMs is 1s, so anything
       * above 1s here can under-run a legal schedule. Refuse at boot.
       */
      TRADE_ALGO_JOBS_INTERVAL_MS: z.coerce.number().int().min(250).max(1_000).default(1_000),

      /**
       * MAY A FUTURES MARKET ACCEPT AN ORDER? (`trade.futures` / D-S-01.)
       *
       * DEFAULT OFF, and off is a product state rather than an outage. With this
       * unset svc-trade boots normally and serves everything it serves today;
       * a futures market is listed, visible, quotable and readable, and an
       * ORDER into one is refused by name with `trade.futures_disabled` — a
       * 403, not a 500 and not a crash-loop. `#883`/`#950` established the
       * distinction: a refusal whose only legal answer is one value is an
       * outage, and this one has a legal answer on both settings.
       *
       * It follows `TRADE_SPOT_ENABLED`'s shape and inverts its DEFAULT, for
       * the reason `TRADE_FUTURES_JOBS_ENABLED` and `TRADE_MM_SEED_ENABLED`
       * already default off: a capability that moves money in a way nobody has
       * yet run in anger must be switched on deliberately, by an operator, and
       * never arrive as a side effect of a deploy.
       *
       * WHAT IT DOES NOT DO, stated because a flag named `FUTURES_ENABLED`
       * invites the assumption that it turns futures on:
       *
       *   · It does not enable FUNDING for any market. That is reserved to the
       *     owner (`docs/adr/2026-08-05-futures-risk-and-mark-law.md`), and
       *     funding still needs `TRADE_FUTURES_JOBS_ENABLED` plus an explicit
       *     `TRADE_FUTURES_FUNDING_MARKET_IDS`.
       *   · It does not name the profit source. `TRADE_FUTURES_PROFIT_SOURCE`
       *     has no default on purpose (`#950`) and this does not supply one.
       *   · It does not RAISE a leverage or margin parameter, and it does not
       *     remove the one ceiling there is. Orders on a futures book are funded
       *     by the same hold as spot (`holdFor` / `assertTradable` in
       *     `spot/risk.ts`), and a MARGIN position opened through
       *     `futures/position-service.ts` is refused above
       *     `DEFAULT_MAX_LEVERAGE` however this flag is set. There used to be no
       *     ceiling at all; see `futures/initial-margin.ts` for what that cost
       *     and for whose ruling the number is awaiting.
       *   · It does not lower the mark bar. `DEFAULT_MIN_BEST_LEVEL_NOTIONAL`
       *     still refuses a dust book, which is the whole reason this flag
       *     could be added at all (`c7dfb5e4`, `cc90c2f4`) — and
       *     `DEFAULT_MIN_BEST_LEVEL_BPS_OF_NOTIONAL` now additionally refuses a
       *     book that is real money but thin for the position it would price,
       *     which is what the dust floor alone did not cover.
       *
       * Kill-switch direction, same as spot: OFF stops NEW orders and never
       * stops cancellations. A switch that traps funds is not a safety control.
       */
      TRADE_FUTURES_ENABLED: z
        .union([z.boolean(), z.string()])
        .default(false)
        .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'on', 'yes'].includes(v.toLowerCase()))),

      /**
       * OPTIONS SETTLEMENT FIXING CONFIG (trade.options / D7).
       *
       * EMPTY BY DEFAULT — and empty is a refusal, not a crash. listMarket with
       * kind=options throws `trade.options_fixing_unconfigured` until this is
       * set to a non-empty opaque string. The string is stamped on the market
       * row as `settlement_fixing`; it is NOT parsed for source, window, expiry
       * clock, or funded payor account. Those are owner law (D7) and inventing
       * them here would be the exact failure this thin slice exists to prevent.
       *
       * No IV surface. No pricing model. Orders on options remain refused by
       * `assertTradable` (`trade.market_kind_unsupported`) until an engine exists.
       */
      TRADE_OPTIONS_SETTLEMENT_FIXING: z.string().default(''),

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
       * Absolute max |period funding rate| as a positive decimal string
       * (same units as published rates — absolute, not bps).
       *
       * NO DEFAULT. The product ceiling is owner residual D2
       * (`docs/BUILD-STOP-TRADE-2026-08-08.md`). Inventing e.g. "0.01" here
       * would dress an interim number as law.
       *
       * Empty: publish + settlement refuse rate application (fail-closed).
       * Non-empty funding market list without this set: boot fails.
       * See `futures/funding-rate-bound.ts`.
       */
      TRADE_FUTURES_FUNDING_MAX_ABS_RATE: z.string().default(''),

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
       * Known ids: `binance-spot`, `bybit-spot` — both PUBLIC MarketDataAdapters,
       * neither holding a credential.
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

      /**
       * OTC RFQ desk law (trade.otc / D-S-02). JSON or empty.
       *
       * Empty (default) = unpublished → refuse-closed. Never invent spread bps,
       * min stake, or principal-vs-maker — DIRECTION §8 owner-only.
       * Published shape: {"published":true,"spreadBps":N,"minStake":"…","counterparty":"platform"|"maker","quoteTtlMs":30000}
       */
      TRADE_OTC_DESK_LAW: z.string().default(''),

      /**
       * OTC reference mids, ops-published: `BASE/QUOTE:mid,BASE/QUOTE:mid`.
       *
       * Empty (default) = the desk can source no price and every quote refuses
       * `trade.otc_no_reference_price`. This is the ONLY place an OTC mid comes
       * from — it is deliberately not a caller input, because a taker who names
       * the price can name it at 1 and take the house inventory.
       */
      TRADE_OTC_MIDS: z.string().default(''),

      /** svc-token — stakeOf for OTC staked-tier gate. */
      TOKEN_URL: z.string().url().default('http://localhost:4003'),
    }),
  );

export const env = loadEnv(schema);
export type Env = typeof env;
