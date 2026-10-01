-- Reverse 0033. Postgres cannot remove an enum value safely, so the label stays.
-- Columns and the evidence CHECK are also dropped here so a database that
-- applied the older combined 0033 (before 0047 existed) still reverses.
-- A full reverse runs 0047.down first; the drops below are then no-ops.

ALTER TABLE "trade"."orders" DROP CONSTRAINT IF EXISTS "orders_recovery_evidence_ck";
ALTER TABLE "trade"."orders" DROP COLUMN IF EXISTS "recovery_reason";
ALTER TABLE "trade"."orders" DROP COLUMN IF EXISTS "reconciliation_key";
