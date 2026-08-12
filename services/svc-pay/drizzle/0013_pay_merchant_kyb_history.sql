-- DIGITAL KYB GETS A HISTORY, AND A LIVE OPERATOR WRITER (pay.psp).
--
-- Migration 0005 added `kyb_ref` — a merchant-supplied dossier handle only.
-- `submitKyb` / `decideKybStub` move `kyb_status`, but under live-only the stub
-- refuses (`pay.kyb_operator_required`) and there is no attributable decide path.
-- KYB money-gate wiring stays `pay.gateway` residual (after a real approver);
-- this migration is the approver surface + the audit trail behind it.
--
-- Tracker title for `pay.psp`: own the merchant, digital KYB, custom pricing.
-- Custom pricing durability is the companion table in this file — feeBps changes
-- only (no invent rates). ADR D-S-10 / Hyperswitch refuse is sealed in code, not
-- here.
--
-- WHAT THIS DOES NOT DO: invent a KYB vendor, invent fees, wire kybStatus into
-- payment.create (that bricks live merchants without an approver — sequenced),
-- or touch settlement / fraud surfaces.

CREATE TABLE IF NOT EXISTS "pay"."merchant_kyb_events" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "seq"         bigserial NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "pay"."merchants"("id"),
  "from_status" "pay"."kyb_status" NOT NULL,
  "to_status"   "pay"."kyb_status" NOT NULL,
  -- Dossier handle at the time of the transition (nullable on decide-only rows
  -- that leave the existing ref untouched).
  "kyb_ref"     text,
  "reason"      text NOT NULL CONSTRAINT "merchant_kyb_events_reason_not_blank" CHECK (length(btrim("reason")) > 0),
  "actor_id"    text NOT NULL,
  "actor_scope" text NOT NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "merchant_kyb_events_seq_idx"
  ON "pay"."merchant_kyb_events" ("seq");

CREATE INDEX IF NOT EXISTS "merchant_kyb_events_merchant_idx"
  ON "pay"."merchant_kyb_events" ("merchant_id", "seq" DESC);

CREATE OR REPLACE FUNCTION "pay"."merchant_kyb_events_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'pay.merchant_kyb_events is append-only: % is not permitted. Reverse with a new row, do not edit the old one.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS "merchant_kyb_events_append_only_trg" ON "pay"."merchant_kyb_events";
CREATE TRIGGER "merchant_kyb_events_append_only_trg"
  BEFORE UPDATE OR DELETE ON "pay"."merchant_kyb_events"
  FOR EACH ROW EXECUTE FUNCTION "pay"."merchant_kyb_events_append_only"();

-- CUSTOM PRICING HISTORY — feeBps only. A blank reason fails the ADR test for
-- merchant durability applied to rate changes: "why is this merchant on 250 bps"
-- must be answerable from the database.
CREATE TABLE IF NOT EXISTS "pay"."merchant_pricing_events" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "seq"         bigserial NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "pay"."merchants"("id"),
  "from_fee_bps" integer NOT NULL,
  "to_fee_bps"   integer NOT NULL,
  "reason"      text NOT NULL CONSTRAINT "merchant_pricing_events_reason_not_blank" CHECK (length(btrim("reason")) > 0),
  "actor_id"    text NOT NULL,
  "actor_scope" text NOT NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "merchant_pricing_events_fee_bps_range"
    CHECK ("from_fee_bps" >= 0 AND "from_fee_bps" <= 10000
       AND "to_fee_bps" >= 0 AND "to_fee_bps" <= 10000)
);

CREATE UNIQUE INDEX IF NOT EXISTS "merchant_pricing_events_seq_idx"
  ON "pay"."merchant_pricing_events" ("seq");

CREATE INDEX IF NOT EXISTS "merchant_pricing_events_merchant_idx"
  ON "pay"."merchant_pricing_events" ("merchant_id", "seq" DESC);

CREATE OR REPLACE FUNCTION "pay"."merchant_pricing_events_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'pay.merchant_pricing_events is append-only: % is not permitted. Change pricing with a new row, do not edit the old one.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS "merchant_pricing_events_append_only_trg" ON "pay"."merchant_pricing_events";
CREATE TRIGGER "merchant_pricing_events_append_only_trg"
  BEFORE UPDATE OR DELETE ON "pay"."merchant_pricing_events"
  FOR EACH ROW EXECUTE FUNCTION "pay"."merchant_pricing_events_append_only"();
