ALTER TABLE "notify"."price_alerts" DROP CONSTRAINT IF EXISTS "price_alerts_kind_ck";
ALTER TABLE "notify"."price_alerts" ADD CONSTRAINT "price_alerts_kind_ck"
  CHECK ("kind" IN ('price', 'funding', 'liquidation_proximity'));
