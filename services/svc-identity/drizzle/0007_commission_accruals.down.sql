-- intafaced:destructive — reversal of 0007_commission_accruals.sql

DROP INDEX IF EXISTS "identity"."affiliate_commission_accruals_fee_event_idx";
DROP INDEX IF EXISTS "identity"."affiliate_commission_accruals_beneficiary_idx";
DROP TABLE IF EXISTS "identity"."affiliate_commission_accruals";
