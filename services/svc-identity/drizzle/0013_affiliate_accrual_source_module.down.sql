-- intafaced:destructive — reversal of 0013_affiliate_accrual_source_module.sql

ALTER TABLE "identity"."affiliate_commission_accruals"
  DROP CONSTRAINT IF EXISTS "affiliate_commission_accruals_source_module_ck";

ALTER TABLE "identity"."affiliate_commission_accruals"
  DROP COLUMN IF EXISTS "source_module";
