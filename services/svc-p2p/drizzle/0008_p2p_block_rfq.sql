-- svc-p2p · firm block/RFQ quotes (PTX-M12).
-- Reversal: 0008_p2p_block_rfq.down.sql
--
-- NOT tagged `intafaced:destructive`: new table.
--
-- A block/RFQ is not a book fill. Size, price and expiry are required columns;
-- there is deliberately no mid column — a missing mid must refuse, not invent.

DO $$ BEGIN
  CREATE TYPE "p2p"."block_quote_lifecycle" AS ENUM ('open', 'bound', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "p2p"."block_quotes" (
  "quote_id"       uuid PRIMARY KEY,
  "maker_id"       text NOT NULL,
  "taker_id"       text NOT NULL,
  "side"           "p2p"."offer_side" NOT NULL,
  "asset"          text NOT NULL,
  "fiat_currency"  text NOT NULL,
  "size"           numeric(38, 18) NOT NULL,
  "price"          numeric(38, 18) NOT NULL,
  "notional"       numeric(38, 18) NOT NULL,
  "created_at"     timestamptz NOT NULL,
  "expires_at"     timestamptz NOT NULL,
  "lifecycle"      "p2p"."block_quote_lifecycle" NOT NULL DEFAULT 'open',
  "accepted_at"    timestamptz,
  "fill_price"     numeric(38, 18),
  "updated_at"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "block_quotes_maker_idx" ON "p2p"."block_quotes" ("maker_id", "lifecycle");
CREATE INDEX IF NOT EXISTS "block_quotes_taker_idx" ON "p2p"."block_quotes" ("taker_id", "lifecycle");

ALTER TABLE "p2p"."block_quotes" DROP CONSTRAINT IF EXISTS "block_quotes_size_positive_ck";
ALTER TABLE "p2p"."block_quotes" ADD CONSTRAINT "block_quotes_size_positive_ck"
  CHECK ("size" > 0);

ALTER TABLE "p2p"."block_quotes" DROP CONSTRAINT IF EXISTS "block_quotes_price_positive_ck";
ALTER TABLE "p2p"."block_quotes" ADD CONSTRAINT "block_quotes_price_positive_ck"
  CHECK ("price" > 0);

ALTER TABLE "p2p"."block_quotes" DROP CONSTRAINT IF EXISTS "block_quotes_notional_positive_ck";
ALTER TABLE "p2p"."block_quotes" ADD CONSTRAINT "block_quotes_notional_positive_ck"
  CHECK ("notional" > 0);

ALTER TABLE "p2p"."block_quotes" DROP CONSTRAINT IF EXISTS "block_quotes_parties_distinct_ck";
ALTER TABLE "p2p"."block_quotes" ADD CONSTRAINT "block_quotes_parties_distinct_ck"
  CHECK ("maker_id" <> "taker_id");

-- Bound quotes carry the quoted price as fill_price. Open/expired never do.
ALTER TABLE "p2p"."block_quotes" DROP CONSTRAINT IF EXISTS "block_quotes_lifecycle_ck";
ALTER TABLE "p2p"."block_quotes" ADD CONSTRAINT "block_quotes_lifecycle_ck"
  CHECK (
    ("lifecycle" = 'bound' AND "accepted_at" IS NOT NULL AND "fill_price" IS NOT NULL AND "fill_price" = "price")
    OR
    ("lifecycle" <> 'bound' AND "accepted_at" IS NULL AND "fill_price" IS NULL)
  );
