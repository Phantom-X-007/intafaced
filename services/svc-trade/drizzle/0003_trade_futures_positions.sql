-- trade.futures · positions table (F2 residual campaign)
-- Reversal: 0003_trade_futures_positions.down.sql
--
-- Holds POSITION STATE only — never balances. Margin lives in ledger
-- purpose-keyed collateral `position:<id>` via futuresMargin* recipes.

DO $$ BEGIN
  CREATE TYPE "trade"."position_side" AS ENUM ('long', 'short');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "trade"."margin_mode" AS ENUM ('cross', 'isolated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "trade"."position_status" AS ENUM ('open', 'closed', 'liquidated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "trade"."positions" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"         text NOT NULL,
  "market_id"       uuid NOT NULL REFERENCES "trade"."markets" ("id"),
  "side"            "trade"."position_side" NOT NULL,
  "status"          "trade"."position_status" NOT NULL DEFAULT 'open',
  "margin_mode"     "trade"."margin_mode" NOT NULL DEFAULT 'isolated',
  -- Decimal strings on the wire / numeric in DB — never JS number money.
  "size"            numeric(38, 18) NOT NULL,
  "entry_price"     numeric(38, 18) NOT NULL,
  "leverage"        numeric(8, 2) NOT NULL DEFAULT 1,
  -- Immutable record of the initial margin post (ledger amount at open).
  "margin_initial"  numeric(38, 18) NOT NULL,
  "margin_asset"    text NOT NULL,
  "funding_paid"    numeric(38, 18) NOT NULL DEFAULT 0,
  "liq_price"       numeric(38, 18),
  "opened_at"       timestamptz NOT NULL DEFAULT now(),
  "closed_at"       timestamptz,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "positions_size_positive_ck" CHECK ("size" > 0),
  CONSTRAINT "positions_entry_positive_ck" CHECK ("entry_price" > 0),
  CONSTRAINT "positions_leverage_positive_ck" CHECK ("leverage" > 0),
  CONSTRAINT "positions_margin_positive_ck" CHECK ("margin_initial" > 0)
);

CREATE INDEX IF NOT EXISTS "positions_user_status_idx"
  ON "trade"."positions" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "positions_market_idx"
  ON "trade"."positions" ("market_id");
-- One open position per (user, market, side, margin_mode) for isolated simplicity.
CREATE UNIQUE INDEX IF NOT EXISTS "positions_open_unique_idx"
  ON "trade"."positions" ("user_id", "market_id", "side", "margin_mode")
  WHERE "status" = 'open';
