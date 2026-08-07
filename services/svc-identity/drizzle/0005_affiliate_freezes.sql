-- svc-identity · affiliate beneficiary freeze (non-pay)
-- Reversal: 0005_affiliate_freezes.down.sql
--
-- Frozen beneficiaries are skipped at accrual time. No ledger payout here.

CREATE TABLE IF NOT EXISTS "identity"."affiliate_freezes" (
  "beneficiary_id"  uuid PRIMARY KEY,
  "frozen_by"       uuid NOT NULL,
  "reason"          text NOT NULL,
  "frozen_at"       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "affiliate_freezes_frozen_at_idx"
  ON "identity"."affiliate_freezes" ("frozen_at" DESC);
