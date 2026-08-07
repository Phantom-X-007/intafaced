-- intafaced:additive — affiliate Slice B durable commission accrual rows
-- Reversal: 0007_commission_accruals.down.sql
--
-- Fee event → commission rows (decimal strings). NOT payout. Slice C ledger
-- recipe remains refuse-closed until DIRECTION §8 rates publish.
-- Idempotent on (fee_event_id, beneficiary_id, hop).

CREATE TABLE IF NOT EXISTS "identity"."affiliate_commission_accruals" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fee_event_id"        text NOT NULL,
  "beneficiary_id"      uuid NOT NULL,
  "payer_id"            uuid NOT NULL,
  "hop"                 integer NOT NULL,
  "rate"                text NOT NULL,
  "fee_amount"          text NOT NULL,
  "commission_amount"   text NOT NULL,
  "asset"               text NOT NULL,
  "accrued_at"          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "affiliate_commission_accruals_hop_ck" CHECK ("hop" >= 0),
  CONSTRAINT "affiliate_commission_accruals_unique"
    UNIQUE ("fee_event_id", "beneficiary_id", "hop")
);

CREATE INDEX IF NOT EXISTS "affiliate_commission_accruals_beneficiary_idx"
  ON "identity"."affiliate_commission_accruals" ("beneficiary_id", "accrued_at" DESC);

CREATE INDEX IF NOT EXISTS "affiliate_commission_accruals_fee_event_idx"
  ON "identity"."affiliate_commission_accruals" ("fee_event_id");
