-- trade.otc · professional RFQ expire constraint
-- Reversal: 0044_otc_quote_expired.down.sql
--
-- Explicit expire is a firm withdrawal, not a requote and not a book fill.

ALTER TABLE "trade"."otc_desk_quotes" DROP CONSTRAINT IF EXISTS "otc_desk_quotes_bound_ck";

ALTER TABLE "trade"."otc_desk_quotes" ADD CONSTRAINT "otc_desk_quotes_bound_ck" CHECK (
  ("lifecycle" = 'open' AND "accepted_at" IS NULL AND "fill_price" IS NULL AND "fill_notional" IS NULL AND "settled_at" IS NULL)
  OR ("lifecycle" = 'expired' AND "accepted_at" IS NULL AND "fill_price" IS NULL AND "fill_notional" IS NULL AND "settled_at" IS NULL)
  OR ("lifecycle" = 'bound' AND "accepted_at" IS NOT NULL AND "fill_price" IS NOT NULL AND "fill_notional" IS NOT NULL AND "settled_at" IS NULL)
  OR ("lifecycle" = 'settled' AND "accepted_at" IS NOT NULL AND "fill_price" IS NOT NULL AND "fill_notional" IS NOT NULL AND "settled_at" IS NOT NULL)
);
