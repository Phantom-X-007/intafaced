-- intafaced:destructive — reversal of 0013_pay_merchant_kyb_history.sql
--
-- Drops the only record of why any merchant's KYB was approved/rejected and why
-- their feeBps changed. `merchants.kyb_status` / `pricing` survive; the reasons
-- do not. Exists so the migration is provably reversible in CI against a scratch
-- schema (§14).

DROP TRIGGER IF EXISTS "merchant_pricing_events_append_only_trg" ON "pay"."merchant_pricing_events";
DROP TABLE IF EXISTS "pay"."merchant_pricing_events";
DROP FUNCTION IF EXISTS "pay"."merchant_pricing_events_append_only"();

DROP TRIGGER IF EXISTS "merchant_kyb_events_append_only_trg" ON "pay"."merchant_kyb_events";
DROP TABLE IF EXISTS "pay"."merchant_kyb_events";
DROP FUNCTION IF EXISTS "pay"."merchant_kyb_events_append_only"();
