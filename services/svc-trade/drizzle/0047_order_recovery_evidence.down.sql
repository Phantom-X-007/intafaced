-- Reverse 0047_order_recovery_evidence.sql

ALTER TABLE "trade"."orders" DROP CONSTRAINT IF EXISTS "orders_recovery_evidence_ck";
ALTER TABLE "trade"."orders" DROP COLUMN IF EXISTS "recovery_reason";
ALTER TABLE "trade"."orders" DROP COLUMN IF EXISTS "reconciliation_key";
