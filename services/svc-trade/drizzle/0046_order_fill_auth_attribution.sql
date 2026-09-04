-- trade.orders / trade.fills · session or API-key attribution (R-auth / PTX-M01-R05).
-- Reversal: 0046_order_fill_auth_attribution.down.sql
--
-- Columns are nullable so historical rows are not backfilled with an invented
-- session. New place/fill writers refuse `trade.auth_attribution_missing`
-- rather than storing a silent blank.

ALTER TABLE "trade"."orders"
  ADD COLUMN IF NOT EXISTS "session_id" text,
  ADD COLUMN IF NOT EXISTS "api_key_id" text;

ALTER TABLE "trade"."fills"
  ADD COLUMN IF NOT EXISTS "session_id" text,
  ADD COLUMN IF NOT EXISTS "api_key_id" text;

COMMENT ON COLUMN "trade"."orders"."session_id" IS
  'Signed principal sid at place. Null on pre-R-auth rows; writers refuse blank rather than invent.';
COMMENT ON COLUMN "trade"."orders"."api_key_id" IS
  'Signed principal kid (API key) at place, or house-mm for seed. Null on pre-R-auth rows.';
COMMENT ON COLUMN "trade"."fills"."session_id" IS
  'Copied from the order at settle. Fill without session or API-key id refuses.';
COMMENT ON COLUMN "trade"."fills"."api_key_id" IS
  'Copied from the order at settle (or house-mm for seed maker).';
