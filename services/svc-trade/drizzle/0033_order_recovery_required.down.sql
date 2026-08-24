ALTER TABLE "trade"."orders" DROP CONSTRAINT IF EXISTS "orders_recovery_evidence_ck";
ALTER TABLE "trade"."orders" DROP COLUMN IF EXISTS "recovery_reason";
ALTER TABLE "trade"."orders" DROP COLUMN IF EXISTS "reconciliation_key";
-- PostgreSQL cannot remove an enum value safely; the forward migration is
-- additive and the down migration intentionally leaves the value in place.
