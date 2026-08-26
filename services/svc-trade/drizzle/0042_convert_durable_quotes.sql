-- trade.convert · durable firm quotes (M27 — not a book trade)
-- Reversal: 0042_convert_durable_quotes.down.sql
--
-- Convert quotes were ephemeral and execute re-walked the book as market IOC.
-- Firm accept needs the quoted in/out amounts, source, and expiry to survive
-- a bounce — never a new mid or fee.

DO $$ BEGIN
  CREATE TYPE "trade"."convert_quote_lifecycle" AS ENUM ('open', 'bound', 'settled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "trade"."convert_quotes" (
  "quote_id"            text PRIMARY KEY,
  "user_id"             text NOT NULL,
  "lifecycle"           "trade"."convert_quote_lifecycle" NOT NULL,
  "symbol"              text NOT NULL,
  "market_id"           text NOT NULL,
  "side"                text NOT NULL,
  "base_asset"          text NOT NULL,
  "quote_asset"         text NOT NULL,
  "in_asset"            text NOT NULL,
  "out_asset"           text NOT NULL,
  "in_amount"           numeric(38, 18) NOT NULL,
  "out_amount"          numeric(38, 18) NOT NULL,
  "requested_qty"       numeric(38, 18) NOT NULL,
  "filled_qty"          numeric(38, 18) NOT NULL,
  "book_notional"       numeric(38, 18) NOT NULL,
  "user_notional"       numeric(38, 18) NOT NULL,
  "avg_price"           numeric(38, 18) NOT NULL,
  "convert_spread_bps"  integer NOT NULL,
  "fully_filled"        boolean NOT NULL,
  "source_kind"         text NOT NULL,
  "source_symbol"       text NOT NULL,
  "source_as_of"        timestamptz NOT NULL,
  "created_at"          timestamptz NOT NULL,
  "expires_at"          timestamptz NOT NULL,
  "accepted_at"         timestamptz,
  "fill_price"          numeric(38, 18),
  "fill_notional"       numeric(38, 18),
  "settled_at"          timestamptz,
  "updated_at"          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "convert_quotes_qty_positive_ck" CHECK ("requested_qty" > 0 AND "filled_qty" > 0),
  CONSTRAINT "convert_quotes_amounts_positive_ck" CHECK (
    "in_amount" > 0 AND "out_amount" > 0 AND "book_notional" > 0 AND "user_notional" > 0 AND "avg_price" > 0
  ),
  CONSTRAINT "convert_quotes_spread_bps_ck" CHECK ("convert_spread_bps" >= 0 AND "convert_spread_bps" <= 5000),
  CONSTRAINT "convert_quotes_side_ck" CHECK ("side" IN ('buy', 'sell')),
  CONSTRAINT "convert_quotes_source_ck" CHECK ("source_kind" = 'book' AND "source_symbol" <> ''),
  CONSTRAINT "convert_quotes_bound_ck" CHECK (
    ("lifecycle" = 'open' AND "accepted_at" IS NULL AND "fill_price" IS NULL AND "fill_notional" IS NULL AND "settled_at" IS NULL)
    OR ("lifecycle" = 'bound' AND "accepted_at" IS NOT NULL AND "fill_price" IS NOT NULL AND "fill_notional" IS NOT NULL AND "settled_at" IS NULL)
    OR ("lifecycle" = 'settled' AND "accepted_at" IS NOT NULL AND "fill_price" IS NOT NULL AND "fill_notional" IS NOT NULL AND "settled_at" IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS "convert_quotes_user_life_idx"
  ON "trade"."convert_quotes" ("user_id", "lifecycle");
