-- MERCHANT PAYOUT DESTINATION — a real ref before withdrawHold.
--
-- payoutSettlement already asserts kind+shape (IBAN / IFSC / EVM) at call time.
-- Without a persisted row the dest is invented per payout and a crash leaves
-- nothing a later attempt can honestly reuse. This table is that row.
--
-- WHAT THIS DOES NOT DO: live-wire bank-payout (adapter stays mode:absent),
-- invent a PSP, or move value. Value still leaves through payoutSettlement
-- → withdrawHold after this ref is loaded.

CREATE TABLE IF NOT EXISTS "pay"."merchant_payout_destinations" (
  "merchant_id" uuid NOT NULL REFERENCES "pay"."merchants"("id"),
  "rail_id"     text NOT NULL,
  "kind"        text NOT NULL CONSTRAINT "merchant_payout_destinations_kind_not_blank" CHECK (length(btrim("kind")) > 0),
  "ref"         text NOT NULL CONSTRAINT "merchant_payout_destinations_ref_not_blank" CHECK (length(btrim("ref")) > 0),
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("merchant_id", "rail_id")
);

CREATE INDEX IF NOT EXISTS "merchant_payout_destinations_merchant_idx"
  ON "pay"."merchant_payout_destinations" ("merchant_id");
