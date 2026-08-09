-- intafaced:additive — fee-pool source module on durable accrual rows
-- Reversal: 0013_affiliate_accrual_source_module.down.sql
--
-- Named residual from Slice C payout (#1477 / ops.affiliates tracker note):
-- FeeEvent and accrual rows did not record which module fee pool held the fee.
-- A trading fee lands in houseFees("trade"); payout defaulted to "identity".
-- That fails as InsufficientFunds rather than inventing — safe, but wrong.
--
-- Default "identity" keeps pre-migration operator-supplied accruals readable;
-- new accrue paths must set the real producer module (trade / pay / …).

ALTER TABLE "identity"."affiliate_commission_accruals"
  ADD COLUMN IF NOT EXISTS "source_module" text NOT NULL DEFAULT 'identity';

ALTER TABLE "identity"."affiliate_commission_accruals"
  DROP CONSTRAINT IF EXISTS "affiliate_commission_accruals_source_module_ck";

ALTER TABLE "identity"."affiliate_commission_accruals"
  ADD CONSTRAINT "affiliate_commission_accruals_source_module_ck"
  CHECK (
    "source_module" ~ '^[a-z][a-z0-9_-]{0,31}$'
  );
