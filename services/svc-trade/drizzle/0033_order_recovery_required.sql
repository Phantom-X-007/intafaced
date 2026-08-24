-- Durable unknown execution outcome (PX-S03/PX-S06/PX-S12).
-- The hold remains in packages/ledger-client until reconciliation proves the
-- engine cannot fill and all earlier outcomes are accounted for.
ALTER TYPE "trade"."order_status" ADD VALUE IF NOT EXISTS 'recovery_required';

ALTER TABLE "trade"."orders"
  ADD COLUMN IF NOT EXISTS "recovery_reason" text,
  ADD COLUMN IF NOT EXISTS "reconciliation_key" text;

ALTER TABLE "trade"."orders" DROP CONSTRAINT IF EXISTS "orders_recovery_evidence_ck";
ALTER TABLE "trade"."orders" ADD CONSTRAINT "orders_recovery_evidence_ck"
  CHECK (
    ("status" = 'recovery_required' AND "recovery_reason" IS NOT NULL AND "reconciliation_key" IS NOT NULL)
    OR ("status" <> 'recovery_required')
  );
