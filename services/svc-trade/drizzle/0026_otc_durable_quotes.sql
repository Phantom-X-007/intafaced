-- trade.otc · durable RFQ quotes + bound accepts (D26-P1-T2 residual)
-- Reversal: 0026_otc_durable_quotes.down.sql
--
-- Quotes and bound fills lived in process Maps and vanished on restart, so
-- accept/settle after a bounce looked like "quote missing" for a price the
-- desk had already promised. This stores the quoted numbers as they were
-- built — never a new mid, spread, stake, or TTL.

DO $$ BEGIN
  CREATE TYPE "trade"."otc_quote_lifecycle" AS ENUM ('open', 'bound', 'settled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "trade"."otc_desk_quotes" (
  "quote_id"          text PRIMARY KEY,
  "user_id"           text NOT NULL,
  "lifecycle"         "trade"."otc_quote_lifecycle" NOT NULL,
  "side"              text NOT NULL,
  "base_asset"        text NOT NULL,
  "quote_asset"       text NOT NULL,
  "qty"               numeric(38, 18) NOT NULL,
  "mid_price"         numeric(38, 18) NOT NULL,
  "quoted_price"      numeric(38, 18) NOT NULL,
  "mid_notional"      numeric(38, 18) NOT NULL,
  "user_notional"     numeric(38, 18) NOT NULL,
  "spread_bps"        integer NOT NULL,
  "spread_notional"   numeric(38, 18) NOT NULL,
  "counterparty"      text NOT NULL,
  "counterparty_id"   text NOT NULL,
  "created_at"        timestamptz NOT NULL,
  "expires_at"        timestamptz NOT NULL,
  "accepted_at"       timestamptz,
  "fill_price"        numeric(38, 18),
  "fill_notional"     numeric(38, 18),
  "settled_at"        timestamptz,
  "updated_at"        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "otc_desk_quotes_qty_positive_ck" CHECK ("qty" > 0),
  CONSTRAINT "otc_desk_quotes_prices_positive_ck" CHECK (
    "mid_price" > 0 AND "quoted_price" > 0 AND "mid_notional" > 0 AND "user_notional" > 0
  ),
  CONSTRAINT "otc_desk_quotes_spread_bps_ck" CHECK ("spread_bps" >= 0 AND "spread_bps" <= 5000),
  CONSTRAINT "otc_desk_quotes_side_ck" CHECK ("side" IN ('buy', 'sell')),
  CONSTRAINT "otc_desk_quotes_counterparty_ck" CHECK ("counterparty" IN ('platform', 'maker')),
  CONSTRAINT "otc_desk_quotes_bound_ck" CHECK (
    ("lifecycle" = 'open' AND "accepted_at" IS NULL AND "fill_price" IS NULL AND "fill_notional" IS NULL AND "settled_at" IS NULL)
    OR ("lifecycle" = 'bound' AND "accepted_at" IS NOT NULL AND "fill_price" IS NOT NULL AND "fill_notional" IS NOT NULL AND "settled_at" IS NULL)
    OR ("lifecycle" = 'settled' AND "accepted_at" IS NOT NULL AND "fill_price" IS NOT NULL AND "fill_notional" IS NOT NULL AND "settled_at" IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS "otc_desk_quotes_user_life_idx"
  ON "trade"."otc_desk_quotes" ("user_id", "lifecycle");
