-- svc-pay · initial schema (§6.1 — GATEWAY CORE + RAIL ADAPTERS)
-- Reversal: 0000_pay_init.down.sql
--
-- The "pay" schema itself is created by the database bootstrap
-- (tooling/infra/postgres-init/01-service-schemas.sql), which also grants it to
-- the svc_pay role. Migrations run as that role and deliberately hold no
-- database-level CREATE privilege — so a migration physically cannot reach
-- outside its own schema (§2).
--
-- Every statement below is idempotent: this file is re-runnable, and CHECK
-- constraints are re-asserted with DROP ... IF EXISTS first so tightening one
-- later is an edit here rather than a new migration.
--
-- NO BALANCES LIVE IN THIS SCHEMA. Every amount here is the record of an
-- agreement or of a completed movement; the value itself is in the ledger
-- (Doctrine §0.6).

DO $$ BEGIN
  CREATE TYPE "pay"."merchant_mode" AS ENUM ('gateway', 'psp', 'payfac');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "pay"."kyb_status" AS ENUM ('none', 'pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "pay"."merchant_status" AS ENUM ('pending', 'active', 'suspended', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "pay"."payment_status" AS ENUM
    ('created', 'authorized', 'captured', 'settled', 'refunded', 'disputed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "pay"."settlement_status" AS ENUM ('pending', 'posted', 'paid_out', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── merchants ────────────────────────────────────────────────────────────────
-- A merchant IS a sovereign account (§6.1): settlement credits `user_id`'s own
-- ledger balance — the same one they trade and spend from.

CREATE TABLE IF NOT EXISTS "pay"."merchants" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"          text NOT NULL,
  "kyb_status"       "pay"."kyb_status" NOT NULL DEFAULT 'none',
  "tier"             integer NOT NULL DEFAULT 0,
  "mode"             "pay"."merchant_mode" NOT NULL DEFAULT 'gateway',
  "pricing"          jsonb NOT NULL DEFAULT '{}'::jsonb,
  "settlement_prefs" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status"           "pay"."merchant_status" NOT NULL DEFAULT 'pending',
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);

-- One merchant per sovereign account. Sub-merchant trees are PayFac mode and
-- come with their own table; until then, two merchant rows for one user would
-- make "settle this user's takings" ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS "merchants_user_idx" ON "pay"."merchants" ("user_id");
CREATE INDEX IF NOT EXISTS "merchants_status_idx" ON "pay"."merchants" ("status");

-- A negative tier would sort below the unverified floor in every limit lookup.
ALTER TABLE "pay"."merchants" DROP CONSTRAINT IF EXISTS "merchants_tier_non_negative_ck";
ALTER TABLE "pay"."merchants" ADD CONSTRAINT "merchants_tier_non_negative_ck"
  CHECK ("tier" >= 0);

-- ── payment_profiles ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pay"."payment_profiles" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "merchant_id"     uuid NOT NULL REFERENCES "pay"."merchants"("id"),
  "checkout_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "fee_routing"     jsonb NOT NULL DEFAULT '{}'::jsonb,
  "domains"         text[] NOT NULL DEFAULT '{}',
  "created_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "payment_profiles_merchant_idx" ON "pay"."payment_profiles" ("merchant_id");

-- ── payments ─────────────────────────────────────────────────────────────────
-- `amount` is the AUTHORIZED amount and never changes. Captured and refunded
-- totals are summed from payment_events — see the note on that table.

CREATE TABLE IF NOT EXISTS "pay"."payments" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "merchant_id"  uuid NOT NULL REFERENCES "pay"."merchants"("id"),
  "profile_id"   uuid REFERENCES "pay"."payment_profiles"("id"),
  "amount"       numeric(38, 18) NOT NULL,
  "currency"     text NOT NULL,
  "method"       text NOT NULL,
  "rail_adapter" text NOT NULL,
  "rail_ref"     text,
  "status"       "pay"."payment_status" NOT NULL DEFAULT 'created',
  "risk_score"   integer,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "payments_merchant_status_idx" ON "pay"."payments" ("merchant_id", "status");
CREATE INDEX IF NOT EXISTS "payments_merchant_created_idx" ON "pay"."payments" ("merchant_id", "created_at");

-- A rail reference identifies exactly one payment. Without this, a webhook
-- carrying a rail reference could match two rows and the handler would have to
-- guess which merchant just got paid.
CREATE UNIQUE INDEX IF NOT EXISTS "payments_rail_ref_idx"
  ON "pay"."payments" ("rail_adapter", "rail_ref");

-- A zero or negative authorization is not a payment. At zero it would also
-- produce a zero-amount ledger entry, which the ledger rejects by design — so
-- the failure would surface three steps later, at capture, instead of here.
ALTER TABLE "pay"."payments" DROP CONSTRAINT IF EXISTS "payments_amount_positive_ck";
ALTER TABLE "pay"."payments" ADD CONSTRAINT "payments_amount_positive_ck"
  CHECK ("amount" > 0);

-- Risk scores are 0-100. A score outside the band silently changes the meaning
-- of every routing rule that compares against it.
ALTER TABLE "pay"."payments" DROP CONSTRAINT IF EXISTS "payments_risk_score_band_ck";
ALTER TABLE "pay"."payments" ADD CONSTRAINT "payments_risk_score_band_ck"
  CHECK ("risk_score" IS NULL OR ("risk_score" >= 0 AND "risk_score" <= 100));

-- Any status past `created` means a rail has spoken, and a rail that has spoken
-- gave us a reference. A captured payment with no rail_ref cannot be refunded,
-- reconciled, or matched to an incoming webhook.
ALTER TABLE "pay"."payments" DROP CONSTRAINT IF EXISTS "payments_rail_ref_required_ck";
ALTER TABLE "pay"."payments" ADD CONSTRAINT "payments_rail_ref_required_ck"
  CHECK ("status" IN ('created', 'failed') OR "rail_ref" IS NOT NULL);

-- ── payment_events ───────────────────────────────────────────────────────────
-- THE APPEND-ONLY STATE HISTORY (§6.1). `payments.status` is a projection of
-- this table; this table is the truth.

CREATE TABLE IF NOT EXISTS "pay"."payment_events" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- THE TOTAL ORDER. `ts` defaults to now(), which inside a transaction is the
  -- transaction's start time — so every event appended by one transition shares
  -- a timestamp and cannot be ordered by it. A history that cannot say whether
  -- the capture came before or after the refund is not a state history.
  "seq"           bigserial NOT NULL,
  "payment_id"    uuid NOT NULL REFERENCES "pay"."payments"("id"),
  "event"         text NOT NULL,
  "payload"       jsonb NOT NULL DEFAULT '{}'::jsonb,
  "rail_event_id" text,
  "ts"            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_events_seq_idx" ON "pay"."payment_events" ("seq");
CREATE INDEX IF NOT EXISTS "payment_events_payment_idx" ON "pay"."payment_events" ("payment_id", "seq");
CREATE INDEX IF NOT EXISTS "payment_events_kind_idx" ON "pay"."payment_events" ("payment_id", "event");

-- THE WEBHOOK DEDUPE. A PSP webhook WILL be delivered twice — that is normal,
-- not exceptional. Partial, because most events here are ours and carry no rail
-- event id; where a rail event id exists it is unique across the whole table,
-- so a redelivery collides no matter which connection it arrives on.
CREATE UNIQUE INDEX IF NOT EXISTS "payment_events_rail_event_idx"
  ON "pay"."payment_events" ("rail_event_id") WHERE "rail_event_id" IS NOT NULL;

-- APPEND-ONLY, ENFORCED.
--
-- The history a chargeback is argued from, and the record that says how much of
-- a payment was captured, are the same rows. An UPDATE here does not correct
-- history, it destroys it — and because captured/refunded totals are summed
-- from these rows, an UPDATE would also silently change how much money the
-- service believes it owes a merchant. So the database refuses.
--
-- Corrections are appended as compensating events, the way a ledger reverses a
-- posting rather than editing it.
CREATE OR REPLACE FUNCTION "pay"."payment_events_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'pay.payment_events is append-only (§6.1 full state history): % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS "payment_events_append_only_trg" ON "pay"."payment_events";
CREATE TRIGGER "payment_events_append_only_trg"
  BEFORE UPDATE OR DELETE ON "pay"."payment_events"
  FOR EACH ROW EXECUTE FUNCTION "pay"."payment_events_append_only"();

-- ── settlements ──────────────────────────────────────────────────────────────
-- Merchant net posts to their ledger account (§6.1). This row is the record of
-- that posting, not the money.

CREATE TABLE IF NOT EXISTS "pay"."settlements" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "merchant_id"    uuid NOT NULL REFERENCES "pay"."merchants"("id"),
  "window"         text NOT NULL,
  "asset_id"       text NOT NULL,
  "gross"          numeric(38, 18) NOT NULL,
  "fees"           numeric(38, 18) NOT NULL,
  "net"            numeric(38, 18) NOT NULL,
  "payout_method"  text,
  "payout_ref"     text,
  -- How many times a payout has been REFUSED by a rail for this settlement.
  --
  -- Not vanity metrics: it is part of the ledger idempotency key for the payout
  -- hold. A rejected payout releases the merchant's hold back to available, and
  -- a retry therefore needs a fresh key — reusing the old one would find the
  -- original hold, move nothing, and then try to settle out of a hold that is
  -- no longer there. It increments only on a rail REFUSAL, never on a crash
  -- retry, so a resumed attempt reuses its key and stays idempotent.
  "payout_attempts" integer NOT NULL DEFAULT 0,
  "status"         "pay"."settlement_status" NOT NULL DEFAULT 'pending',
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now()
);

-- A WINDOW SETTLES EXACTLY ONCE, PER ASSET. This is the anti-double-pay rule:
-- without it, a re-run of the settlement job pays the merchant twice for the
-- same takings, and the second payment has no revenue behind it.
CREATE UNIQUE INDEX IF NOT EXISTS "settlements_window_idx"
  ON "pay"."settlements" ("merchant_id", "window", "asset_id");
CREATE INDEX IF NOT EXISTS "settlements_status_idx" ON "pay"."settlements" ("status");

-- CONSERVATION. gross = fees + net, exactly. A rounding bug in the fee split
-- would otherwise hand the merchant value the payments never produced, or keep
-- value the merchant earned.
ALTER TABLE "pay"."settlements" DROP CONSTRAINT IF EXISTS "settlements_conserved_ck";
ALTER TABLE "pay"."settlements" ADD CONSTRAINT "settlements_conserved_ck"
  CHECK ("gross" >= 0 AND "fees" >= 0 AND "net" >= 0 AND "fees" + "net" = "gross");

-- A settlement of nothing is a job that ran on an empty window and recorded a
-- payout obligation anyway.
ALTER TABLE "pay"."settlements" DROP CONSTRAINT IF EXISTS "settlements_net_positive_ck";
ALTER TABLE "pay"."settlements" ADD CONSTRAINT "settlements_net_positive_ck"
  CHECK ("net" > 0);

-- A settlement that reports a payout reference without a method (or the other
-- way round) cannot be traced back to the rail that moved the money.
ALTER TABLE "pay"."settlements" DROP CONSTRAINT IF EXISTS "settlements_payout_paired_ck";
ALTER TABLE "pay"."settlements" ADD CONSTRAINT "settlements_payout_paired_ck"
  CHECK ("status" <> 'paid_out' OR ("payout_method" IS NOT NULL AND "payout_ref" IS NOT NULL));

-- A negative attempt count would produce a colliding idempotency key with an
-- earlier attempt, which is the one thing this column exists to prevent.
ALTER TABLE "pay"."settlements" DROP CONSTRAINT IF EXISTS "settlements_attempts_non_negative_ck";
ALTER TABLE "pay"."settlements" ADD CONSTRAINT "settlements_attempts_non_negative_ck"
  CHECK ("payout_attempts" >= 0);
