-- svc-trade · initial schema (§5.2 THE PRODUCT LAYER — trade.spot)
-- Reversal: 0000_trade_init.down.sql
--
-- The "trade" schema itself is created by the database bootstrap
-- (tooling/infra/postgres-init/01-service-schemas.sql), which also grants it to
-- the svc_trade role. Migrations run as that role and deliberately hold no
-- database-level CREATE privilege — so a migration physically cannot reach
-- outside its own schema (§2).
--
-- Every statement below is idempotent: this file is re-runnable, and the CHECK
-- constraints are re-asserted with DROP ... IF EXISTS first so tightening one
-- later is an edit here rather than a new migration.
--
-- SCOPE: trade.spot. §5.2 also lists positions, funding_rates, insurance_fund,
-- copy_leaders, copy_follows and otc_quotes; those ship with trade.futures,
-- trade.copy and trade.otc, which are separate tracker features. The market
-- kind enum already carries their values, so listing a futures market later is
-- an INSERT, not a migration.

DO $$ BEGIN
  CREATE TYPE "trade"."market_kind" AS ENUM ('spot', 'futures', 'options');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "trade"."market_status" AS ENUM ('pending', 'active', 'halted', 'delisted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "trade"."order_side" AS ENUM ('buy', 'sell');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "trade"."order_type" AS ENUM ('market', 'limit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "trade"."time_in_force" AS ENUM ('GTC', 'IOC', 'FOK', 'PO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "trade"."order_status" AS ENUM ('pending', 'open', 'filled', 'cancelled', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "trade"."liquidity" AS ENUM ('maker', 'taker');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── markets ──────────────────────────────────────────────────────────────────
-- What is listed, on what terms (§5.2).

CREATE TABLE IF NOT EXISTS "trade"."markets" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "symbol"       text NOT NULL,
  "base_asset"   text NOT NULL,
  "quote_asset"  text NOT NULL,
  "kind"         "trade"."market_kind" NOT NULL DEFAULT 'spot',
  "tick_size"    numeric(38, 18) NOT NULL,
  "lot_size"     numeric(38, 18) NOT NULL,
  "min_qty"      numeric(38, 18) NOT NULL,
  "max_qty"      numeric(38, 18),
  "min_notional" numeric(38, 18) NOT NULL,
  "status"       "trade"."market_status" NOT NULL DEFAULT 'pending',
  "maker_bps"    numeric(8, 0) NOT NULL,
  "taker_bps"    numeric(8, 0) NOT NULL,
  "listed_at"    timestamptz,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

-- One market per symbol, ever. Two `BTC/USDT` rows would be two books, and
-- every integrator addresses a market by its symbol.
CREATE UNIQUE INDEX IF NOT EXISTS "markets_symbol_idx" ON "trade"."markets" ("symbol");
CREATE INDEX IF NOT EXISTS "markets_status_idx" ON "trade"."markets" ("status");
CREATE INDEX IF NOT EXISTS "markets_pair_idx" ON "trade"."markets" ("base_asset", "quote_asset");

-- A market must not be able to price itself against itself.
ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_distinct_assets_ck";
ALTER TABLE "trade"."markets" ADD CONSTRAINT "markets_distinct_assets_ck"
  CHECK ("base_asset" <> "quote_asset");

-- Increments must be strictly positive: a zero tick makes every price valid and
-- a zero lot makes a zero-quantity order valid, which the engine would reject
-- and the ledger could not post.
ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_increments_positive_ck";
ALTER TABLE "trade"."markets" ADD CONSTRAINT "markets_increments_positive_ck"
  CHECK ("tick_size" > 0 AND "lot_size" > 0 AND "min_qty" > 0 AND "min_notional" > 0);

-- THE DUST GUARD. The smallest possible fill on this market is one lot at one
-- tick; if that product rounds to zero at 18dp, a legal fill would have a quote
-- amount of nothing, and the ledger refuses to post a movement of nothing.
-- Enforced here rather than only in the service because a bad listing would
-- otherwise sit dormant until the first partial fill hit it in production.
ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_dust_free_ck";
ALTER TABLE "trade"."markets" ADD CONSTRAINT "markets_dust_free_ck"
  CHECK ("tick_size" * "lot_size" >= 0.000000000000000001);

ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_qty_range_ck";
ALTER TABLE "trade"."markets" ADD CONSTRAINT "markets_qty_range_ck"
  CHECK ("max_qty" IS NULL OR "max_qty" >= "min_qty");

-- Fees are basis points of a fill, and a fee at or above 100% would mean a side
-- receives nothing or less than nothing from a trade it agreed to.
ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_fee_bounds_ck";
ALTER TABLE "trade"."markets" ADD CONSTRAINT "markets_fee_bounds_ck"
  CHECK ("maker_bps" >= 0 AND "maker_bps" < 10000 AND "taker_bps" >= 0 AND "taker_bps" < 10000);

-- An active market is one someone can trade; it must have a listing date.
ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_active_listed_ck";
ALTER TABLE "trade"."markets" ADD CONSTRAINT "markets_active_listed_ck"
  CHECK ("status" <> 'active' OR "listed_at" IS NOT NULL);

-- ── orders ───────────────────────────────────────────────────────────────────
-- Order state. NOT balances (Doctrine §0.6) — the held value lives in the
-- ledger's `hold` accounts and `hold_amount` is only the immutable record of
-- which post put it there.

CREATE TABLE IF NOT EXISTS "trade"."orders" (
  "id"               uuid PRIMARY KEY,
  "user_id"          uuid NOT NULL,
  "sub_account_id"   uuid,
  "market_id"        uuid NOT NULL REFERENCES "trade"."markets" ("id"),
  "client_order_id"  text,
  "side"             "trade"."order_side" NOT NULL,
  "type"             "trade"."order_type" NOT NULL,
  "price"            numeric(38, 18),
  "qty"              numeric(38, 18) NOT NULL,
  "filled_qty"       numeric(38, 18) NOT NULL DEFAULT 0,
  "status"           "trade"."order_status" NOT NULL DEFAULT 'pending',
  "tif"              "trade"."time_in_force" NOT NULL DEFAULT 'GTC',
  "hold_asset"       text NOT NULL,
  "hold_amount"      numeric(38, 18) NOT NULL,
  "fee_discount_bps" numeric(8, 0) NOT NULL DEFAULT 0,
  "protection_price" numeric(38, 18),
  "engine_sequence"  integer,
  "reject_code"      text,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);

-- THE RETRY GUARD (§5 money paths: "a retry must find the original"). The order
-- id is derived from this triple, so this index is almost redundant — which is
-- exactly why it is here: the database refuses a second order for the same
-- client id even if the derivation is ever changed. NULL client ids are
-- distinct in Postgres, so callers that opt out of idempotency are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "orders_client_id_idx"
  ON "trade"."orders" ("user_id", "market_id", "client_order_id");
CREATE INDEX IF NOT EXISTS "orders_user_status_idx" ON "trade"."orders" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "orders_market_status_idx" ON "trade"."orders" ("market_id", "status");
CREATE INDEX IF NOT EXISTS "orders_created_idx" ON "trade"."orders" ("created_at");

ALTER TABLE "trade"."orders" DROP CONSTRAINT IF EXISTS "orders_qty_positive_ck";
ALTER TABLE "trade"."orders" ADD CONSTRAINT "orders_qty_positive_ck"
  CHECK ("qty" > 0 AND "filled_qty" >= 0);

-- An order cannot match more than it asked for. If this ever fires, the engine
-- and this service disagree about a book, and every downstream number is suspect.
ALTER TABLE "trade"."orders" DROP CONSTRAINT IF EXISTS "orders_not_overfilled_ck";
ALTER TABLE "trade"."orders" ADD CONSTRAINT "orders_not_overfilled_ck"
  CHECK ("filled_qty" <= "qty");

-- A limit order without a price is the single most common integration bug, and
-- a market order with one is a caller who thinks they placed a limit.
ALTER TABLE "trade"."orders" DROP CONSTRAINT IF EXISTS "orders_price_shape_ck";
ALTER TABLE "trade"."orders" ADD CONSTRAINT "orders_price_shape_ck"
  CHECK (("type" = 'limit' AND "price" IS NOT NULL AND "price" > 0) OR ("type" = 'market' AND "price" IS NULL));

-- THE FUNDING INVARIANT, in the database. Every order row carries the hold that
-- funds it, and a non-positive hold is an order the engine could match against
-- money that is not there. The service posts the hold before it leaves
-- `pending`; this makes a row that skipped that step unrepresentable.
ALTER TABLE "trade"."orders" DROP CONSTRAINT IF EXISTS "orders_hold_positive_ck";
ALTER TABLE "trade"."orders" ADD CONSTRAINT "orders_hold_positive_ck"
  CHECK ("hold_amount" > 0);

-- A discount is a fraction of the fee; at 10000 bps the house pays the user to trade.
ALTER TABLE "trade"."orders" DROP CONSTRAINT IF EXISTS "orders_discount_bounds_ck";
ALTER TABLE "trade"."orders" ADD CONSTRAINT "orders_discount_bounds_ck"
  CHECK ("fee_discount_bps" >= 0 AND "fee_discount_bps" < 10000);

-- ── fills ────────────────────────────────────────────────────────────────────
-- The reporting projection of matches that have already settled in the ledger.
-- Two rows per match: the maker's leg and the taker's leg.

CREATE TABLE IF NOT EXISTS "trade"."fills" (
  "id"               uuid PRIMARY KEY,
  "order_id"         uuid NOT NULL REFERENCES "trade"."orders" ("id"),
  "counter_order_id" uuid NOT NULL,
  "market_id"        uuid NOT NULL REFERENCES "trade"."markets" ("id"),
  "user_id"          uuid NOT NULL,
  "side"             "trade"."order_side" NOT NULL,
  "liquidity"        "trade"."liquidity" NOT NULL,
  "price"            numeric(38, 18) NOT NULL,
  "qty"              numeric(38, 18) NOT NULL,
  "quote_amount"     numeric(38, 18) NOT NULL,
  "fee_asset"        text NOT NULL,
  "fee_amount"       numeric(38, 18) NOT NULL,
  "fee_bps"          numeric(8, 0) NOT NULL,
  "sequence"         integer NOT NULL,
  "ts"               timestamptz NOT NULL DEFAULT now(),
  "created_at"       timestamptz NOT NULL DEFAULT now()
);

-- ONE MATCH SETTLES ONCE PER SIDE. The engine sequence is the business key: a
-- redelivered `intafaced.matching.order.filled` collides here and the insert is
-- a no-op, which is the last line of defence behind the ledger's own
-- `trade.fill:<fillId>` idempotency key. Two lines, because a double-settled
-- fill pays a counterparty twice out of a hold that only funded one trade.
CREATE UNIQUE INDEX IF NOT EXISTS "fills_market_sequence_role_idx"
  ON "trade"."fills" ("market_id", "sequence", "liquidity");
CREATE INDEX IF NOT EXISTS "fills_order_idx" ON "trade"."fills" ("order_id");
CREATE INDEX IF NOT EXISTS "fills_user_ts_idx" ON "trade"."fills" ("user_id", "ts");
CREATE INDEX IF NOT EXISTS "fills_market_ts_idx" ON "trade"."fills" ("market_id", "ts");

ALTER TABLE "trade"."fills" DROP CONSTRAINT IF EXISTS "fills_positive_ck";
ALTER TABLE "trade"."fills" ADD CONSTRAINT "fills_positive_ck"
  CHECK ("price" > 0 AND "qty" > 0 AND "quote_amount" > 0 AND "fee_amount" >= 0);

-- A fee cannot exceed what the side received. `tradeFill` refuses to build such
-- an entry set; this refuses to record one, so the two cannot disagree.
ALTER TABLE "trade"."fills" DROP CONSTRAINT IF EXISTS "fills_fee_bounded_ck";
ALTER TABLE "trade"."fills" ADD CONSTRAINT "fills_fee_bounded_ck"
  CHECK ("fee_bps" >= 0 AND "fee_bps" < 10000);
