ALTER TABLE "notify"."price_alerts" DROP CONSTRAINT IF EXISTS "price_alerts_kind_ck";
ALTER TABLE "notify"."price_alerts" DROP COLUMN IF EXISTS "kind";
