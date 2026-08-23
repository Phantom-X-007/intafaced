-- svc-notify · v22.alerts sourced-mark kinds (funding + liquidation_proximity)
-- Reversal: 0007_notify_alert_kinds.down.sql
--
-- Price / funding / liquidation-proximity watches share the sourced mark.
-- kind is a label on that comparison — never a second series. Whale and
-- intelligence stay unpublished and are never stored.

ALTER TABLE "notify"."price_alerts"
  ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'price';

ALTER TABLE "notify"."price_alerts" DROP CONSTRAINT IF EXISTS "price_alerts_kind_ck";
ALTER TABLE "notify"."price_alerts" ADD CONSTRAINT "price_alerts_kind_ck"
  CHECK ("kind" IN ('price', 'funding', 'liquidation_proximity'));
