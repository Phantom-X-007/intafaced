-- svc-market · vendor lifecycle Stage 1 — APPLY, THEN VET (§8.7, `market.vendors`)
-- Reversal: 0000_market_vendors.down.sql
--
-- The "market" schema itself is created by the database bootstrap
-- (tooling/infra/postgres-init/01-service-schemas.sql), which grants it to the
-- svc_market role. Migrations run as that role and hold no database-level
-- CREATE, so a migration physically cannot reach outside its own schema (§2).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- NO MONEY IN THIS FILE, AND NO COLUMN HERE COULD HOLD ANY.
--
-- There is no amount, no price, no balance and no stake threshold. Purchases,
-- subscriptions and house commission are `market.commerce`, a different
-- mountain. The stake that will eventually gate listing SLOTS is owned by
-- svc-token (`economics/staking.ts`, `vendorSlots`) and is read from there in
-- Stage 2 — never copied here, because a second copy of a stake schedule is a
-- second answer to "may this vendor list" and the two diverge on the first
-- tuning change (docs/ops/trk/market.vendors.md:76).
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every statement is idempotent: this file is re-runnable.

DO $$ BEGIN
  CREATE TYPE "market"."vendor_status" AS ENUM ('applied', 'approved', 'rejected', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── vendors ──────────────────────────────────────────────────────────────────
--
-- ONE ROW PER USER, not per organisation. `TRK-market.vendors.md:74` leaves
-- org-vs-user open and this migration answers it the reversible way round:
-- adding an `org_id` later is a nullable column and a backfill, whereas starting
-- with organisations and discovering that vendors are people means unpicking a
-- join. The UNIQUE on `user_id` is what makes "one application per user" a
-- database fact rather than a race between two clicks.
CREATE TABLE IF NOT EXISTS "market"."vendors" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      uuid NOT NULL,
  "display_name" text NOT NULL,
  "description"  text NOT NULL,

  -- Every application starts here, and there is no code path that writes any
  -- other value at INSERT time. An application that could be born approved is
  -- an application nobody vetted.
  "status"       "market"."vendor_status" NOT NULL DEFAULT 'applied',

  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "vendors_user_idx" ON "market"."vendors" ("user_id");

-- The query the operator queue actually runs: this status, oldest first.
CREATE INDEX IF NOT EXISTS "vendors_status_idx" ON "market"."vendors" ("status", "created_at");

ALTER TABLE "market"."vendors" DROP CONSTRAINT IF EXISTS "vendors_display_name_ck";
ALTER TABLE "market"."vendors" ADD CONSTRAINT "vendors_display_name_ck"
  CHECK (length(btrim("display_name")) > 0 AND length("display_name") <= 80);

ALTER TABLE "market"."vendors" DROP CONSTRAINT IF EXISTS "vendors_description_ck";
ALTER TABLE "market"."vendors" ADD CONSTRAINT "vendors_description_ck"
  CHECK (length(btrim("description")) > 0 AND length("description") <= 2000);

-- ── vendor_status_events ─────────────────────────────────────────────────────
--
-- The answer to "why was this vendor rejected", held in the database rather than
-- in somebody's memory. Same shape and same reasoning as
-- `pay.merchant_status_events`, which exists because merchant state was
-- enforced by a column nothing wrote a history for.
CREATE TABLE IF NOT EXISTS "market"."vendor_status_events" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- `bigserial`, not a timestamp. `now()` inside a transaction is the
  -- TRANSACTION'S start time, so two transitions written by one statement share
  -- a timestamp and cannot be ordered by it. A history that cannot say which
  -- change came first is not a history.
  "seq"         bigserial NOT NULL,

  "vendor_id"   uuid NOT NULL REFERENCES "market"."vendors"("id"),

  -- BOTH SIDES of the transition. A row carrying only the new value cannot be
  -- read on its own, and the first row cannot be read at all — there is nothing
  -- before it to compare against. Storing both also makes a gap in the chain
  -- (`from` not matching the previous `to`) detectable rather than invisible.
  "from_status" "market"."vendor_status" NOT NULL,
  "to_status"   "market"."vendor_status" NOT NULL,

  -- REQUIRED, and free text on purpose.
  --
  -- No vetting criterion exists anywhere in this repository — `market.vendors.md`
  -- names it an open product question — so an enum of reasons would force every
  -- real situation into whichever of five codes was least wrong, and the actual
  -- explanation would go into a ticket nobody keeps. The check refuses an empty
  -- string, so "required" means required rather than a space.
  "reason"      text NOT NULL CONSTRAINT "vendor_status_events_reason_not_blank" CHECK (length(btrim("reason")) > 0),

  -- WHO. The operator's user id, from the authenticated principal — never from a
  -- request body, or the column records who the caller said they were.
  "actor_id"    uuid NOT NULL,

  -- WHAT AUTHORISED IT. The scope the caller actually held. Recorded because
  -- scope law changes over time, and "this was done under market:ops in August"
  -- is a different fact from "whoever did this would need market:ops today".
  "actor_scope" text NOT NULL,

  "created_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "vendor_status_events_seq_idx"
  ON "market"."vendor_status_events" ("seq");

-- The query an operator actually runs: this vendor, newest first.
CREATE INDEX IF NOT EXISTS "vendor_status_events_vendor_idx"
  ON "market"."vendor_status_events" ("vendor_id", "seq" DESC);

-- APPEND-ONLY, ENFORCED BY THE DATABASE — the same trigger shape
-- `pay.merchant_status_events` uses.
--
-- A vetting history that can be edited is worse than none: it looks like
-- evidence and is not. If a rejection was wrong, the correction is a NEW ROW
-- approving the vendor with a reason, the way a ledger reverses a posting rather
-- than amending it. Both rows stay, and the trail reads "we rejected them on the
-- 3rd for this, and we were wrong on the 5th" — the only version of that story a
-- vendor can check.
CREATE OR REPLACE FUNCTION "market"."vendor_status_events_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'market.vendor_status_events is append-only: % is not permitted. Correct with a new row, do not edit the old one.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS "vendor_status_events_append_only_trg" ON "market"."vendor_status_events";
CREATE TRIGGER "vendor_status_events_append_only_trg"
  BEFORE UPDATE OR DELETE ON "market"."vendor_status_events"
  FOR EACH ROW EXECUTE FUNCTION "market"."vendor_status_events_append_only"();
