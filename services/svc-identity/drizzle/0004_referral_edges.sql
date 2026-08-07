-- svc-identity · affiliate referral edges Slice A (NO commission / NO payout)
-- Reversal: 0004_referral_edges.down.sql
--
-- Who introduced whom only. Commission accrual + ledger payout are Slice B/C.

CREATE TABLE IF NOT EXISTS "identity"."referral_edges" (
  "user_id"        uuid PRIMARY KEY,
  "referrer_id"    uuid NOT NULL,
  "attributed_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "referral_edges_no_self_ck" CHECK ("user_id" <> "referrer_id")
);

CREATE INDEX IF NOT EXISTS "referral_edges_referrer_idx"
  ON "identity"."referral_edges" ("referrer_id", "attributed_at" DESC);
