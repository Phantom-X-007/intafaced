-- svc-notify · v22.alerts whale flow kind
-- Reversal: 0008_notify_whale_kind.down.sql
--
-- Whale watches store like other sourced-mark kinds. Evaluation uses a
-- separate flow mark (never the price print). Intelligence stays unpublished
-- and is never stored.

ALTER TABLE "notify"."price_alerts" DROP CONSTRAINT IF EXISTS "price_alerts_kind_ck";
ALTER TABLE "notify"."price_alerts" ADD CONSTRAINT "price_alerts_kind_ck"
  CHECK ("kind" IN ('price', 'funding', 'liquidation_proximity', 'whale'));
