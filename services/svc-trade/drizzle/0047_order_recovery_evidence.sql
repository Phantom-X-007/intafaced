-- trade.orders · recovery evidence columns and CHECK
-- Reversal: 0047_order_recovery_evidence.down.sql
--
-- The hold remains in packages/ledger-client until reconciliation proves the
-- engine cannot fill and all earlier outcomes are accounted for.
-- Uses the enum value committed by 0033_order_recovery_required.sql.
-- Idempotent for databases that already applied the older combined 0033.

ALTER TABLE "trade"."orders"
  ADD COLUMN IF NOT EXISTS "recovery_reason" text,
  ADD COLUMN IF NOT EXISTS "reconciliation_key" text;

ALTER TABLE "trade"."orders" DROP CONSTRAINT IF EXISTS "orders_recovery_evidence_ck";
ALTER TABLE "trade"."orders" ADD CONSTRAINT "orders_recovery_evidence_ck"
  CHECK (
    ("status" = 'recovery_required' AND "recovery_reason" IS NOT NULL AND "reconciliation_key" IS NOT NULL)
    OR ("status" <> 'recovery_required')
  );
