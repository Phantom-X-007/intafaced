-- Reverse 0044_otc_quote_expired.sql — restore open/bound/settled-only bound check.

ALTER TABLE "trade"."otc_desk_quotes" DROP CONSTRAINT IF EXISTS "otc_desk_quotes_bound_ck";

ALTER TABLE "trade"."otc_desk_quotes" ADD CONSTRAINT "otc_desk_quotes_bound_ck" CHECK (
  ("lifecycle" = 'open' AND "accepted_at" IS NULL AND "fill_price" IS NULL AND "fill_notional" IS NULL AND "settled_at" IS NULL)
  OR ("lifecycle" = 'bound' AND "accepted_at" IS NOT NULL AND "fill_price" IS NOT NULL AND "fill_notional" IS NOT NULL AND "settled_at" IS NULL)
  OR ("lifecycle" = 'settled' AND "accepted_at" IS NOT NULL AND "fill_price" IS NOT NULL AND "fill_notional" IS NOT NULL AND "settled_at" IS NOT NULL)
);
