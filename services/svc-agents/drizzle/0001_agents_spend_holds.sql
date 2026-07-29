-- svc-agents · pre-flight spend reservations (§8.2)
-- Reversal: 0001_agents_spend_holds.down.sql
--
-- 0000 metered honestly but billed only at settlement. That is a budget check
-- that runs after the money is gone: by the time the window seals, the provider
-- has been paid for every call in it, so a user who cannot afford the bill has
-- already spent the house's money and the only remaining question is who eats
-- it. A limit you can only discover you have exceeded is not a limit.
--
-- This migration adds the reservation the runtime now takes BEFORE it calls the
-- engine, and the columns that let a settled window's remainder be returned
-- exactly once.
--
-- Every statement is idempotent, matching 0000.

-- ── usage_holds ──────────────────────────────────────────────────────────────
-- One row per reserved engine call. Amounts are numeric(38,18) — money is never
-- a float here or anywhere else.

CREATE TABLE IF NOT EXISTS "agents"."usage_holds" (
  "session_id"  uuid NOT NULL,
  "window_id"   text NOT NULL,
  -- The caller's request id. Same handle as `usage_records`, so the reservation
  -- and the usage it paid for share one identity across every retry.
  "request_id"  text NOT NULL,
  "amount"      numeric(38, 18) NOT NULL,
  "hold_key"    text NOT NULL,
  -- NULL until the ledger has confirmed the reservation. See the comment on
  -- `usage_holds_confirmed_idx` — an unconfirmed row is not money.
  "hold_tx_id"  text,
  -- Set when the reservation was given back without being spent: the engine
  -- failed, or it answered and we could not record the answer.
  "voided_at"   timestamptz,
  "void_tx_id"  text,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("session_id", "request_id"),
  CONSTRAINT "usage_holds_window_fk"
    FOREIGN KEY ("session_id", "window_id")
    REFERENCES "agents"."usage_windows" ("session_id", "window_id")
);

-- Settlement sums this index to learn what a window actually has reserved.
CREATE INDEX IF NOT EXISTS "usage_holds_window_idx"
  ON "agents"."usage_holds" ("session_id", "window_id");

-- Reservations that are real money right now: confirmed by the ledger and not
-- yet given back. Anything else must NOT count toward what a window may release,
-- because releasing value that was never reserved would draw down whatever else
-- the user has in `hold` — one claim spending another's reservation, which is
-- the exact failure P0-3 purposed holds exist to prevent.
CREATE INDEX IF NOT EXISTS "usage_holds_confirmed_idx"
  ON "agents"."usage_holds" ("session_id", "window_id")
  WHERE "hold_tx_id" IS NOT NULL AND "voided_at" IS NULL;

ALTER TABLE "agents"."usage_holds" DROP CONSTRAINT IF EXISTS "usage_holds_amount_positive_ck";
ALTER TABLE "agents"."usage_holds" ADD CONSTRAINT "usage_holds_amount_positive_ck"
  CHECK ("amount" > 0);

-- A void is a ledger movement. Recording one without its transaction id leaves
-- a reservation that the books say is still held and this table says is not.
ALTER TABLE "agents"."usage_holds" DROP CONSTRAINT IF EXISTS "usage_holds_void_complete_ck";
ALTER TABLE "agents"."usage_holds" ADD CONSTRAINT "usage_holds_void_complete_ck"
  CHECK ("voided_at" IS NULL OR "void_tx_id" IS NOT NULL);

-- You cannot give back what was never taken.
ALTER TABLE "agents"."usage_holds" DROP CONSTRAINT IF EXISTS "usage_holds_void_needs_hold_ck";
ALTER TABLE "agents"."usage_holds" ADD CONSTRAINT "usage_holds_void_needs_hold_ck"
  CHECK ("voided_at" IS NULL OR "hold_tx_id" IS NOT NULL);

-- ── usage_windows · the release side of settlement ───────────────────────────
--
-- `charged_amount` says what the window billed. These say what it gave back.
-- Without them a crash between the charge and the release is indistinguishable
-- from a window that had nothing to return, and the difference is the user's
-- money sitting in a hold pot forever.

ALTER TABLE "agents"."usage_windows" ADD COLUMN IF NOT EXISTS "held_amount"     numeric(38, 18);
ALTER TABLE "agents"."usage_windows" ADD COLUMN IF NOT EXISTS "charged_from_hold" numeric(38, 18);
ALTER TABLE "agents"."usage_windows" ADD COLUMN IF NOT EXISTS "released_amount" numeric(38, 18);
ALTER TABLE "agents"."usage_windows" ADD COLUMN IF NOT EXISTS "release_tx_id"   text;
ALTER TABLE "agents"."usage_windows" ADD COLUMN IF NOT EXISTS "released_at"     timestamptz;

ALTER TABLE "agents"."usage_windows" DROP CONSTRAINT IF EXISTS "usage_windows_release_amounts_ck";
ALTER TABLE "agents"."usage_windows" ADD CONSTRAINT "usage_windows_release_amounts_ck"
  CHECK (
    ("held_amount"       IS NULL OR "held_amount"       >= 0) AND
    ("charged_from_hold" IS NULL OR "charged_from_hold" >= 0) AND
    ("released_amount"   IS NULL OR "released_amount"   >= 0)
  );

-- A window cannot return a reservation before it has decided what to keep.
ALTER TABLE "agents"."usage_windows" DROP CONSTRAINT IF EXISTS "usage_windows_release_after_seal_ck";
ALTER TABLE "agents"."usage_windows" ADD CONSTRAINT "usage_windows_release_after_seal_ck"
  CHECK ("released_at" IS NULL OR "sealed_at" IS NOT NULL);

-- THE CONSERVATION CONSTRAINT.
--
-- What a window reserved is what it kept plus what it gave back. If these ever
-- disagree the difference is real money that belongs to somebody and is recorded
-- as belonging to nobody, so it is checked in the database rather than trusted
-- to the settlement code that computes it.
ALTER TABLE "agents"."usage_windows" DROP CONSTRAINT IF EXISTS "usage_windows_hold_conserved_ck";
ALTER TABLE "agents"."usage_windows" ADD CONSTRAINT "usage_windows_hold_conserved_ck"
  CHECK (
    "released_at" IS NULL
    OR ("held_amount" IS NOT NULL AND "charged_from_hold" IS NOT NULL AND "released_amount" IS NOT NULL
        AND "held_amount" = "charged_from_hold" + "released_amount")
  );

-- NO RESERVATION IN A SETTLED WINDOW.
--
-- The mirror of `usage_records_no_late_usage`. A reservation arriving after the
-- window sealed would be held against a period whose remainder has already been
-- computed and returned, so it would never be released by anything.
CREATE OR REPLACE FUNCTION "agents"."usage_holds_reject_sealed"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sealed timestamptz;
BEGIN
  SELECT w."sealed_at" INTO sealed
    FROM "agents"."usage_windows" w
   WHERE w."session_id" = NEW."session_id" AND w."window_id" = NEW."window_id";

  IF sealed IS NOT NULL THEN
    RAISE EXCEPTION 'usage window % for session % was settled at % and accepts no further reservations',
      NEW."window_id", NEW."session_id", sealed
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "usage_holds_no_late_hold" ON "agents"."usage_holds";
CREATE TRIGGER "usage_holds_no_late_hold"
  BEFORE INSERT ON "agents"."usage_holds"
  FOR EACH ROW EXECUTE FUNCTION "agents"."usage_holds_reject_sealed"();

-- A window releases once. A second release would hand back value the first one
-- already returned — the ledger key stops the post, but the row would then claim
-- a release that did not happen, and reconciliation reads the row.
CREATE OR REPLACE FUNCTION "agents"."usage_windows_release_once"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."released_at" IS NOT NULL AND (
       NEW."released_at"     IS DISTINCT FROM OLD."released_at"
    OR NEW."released_amount" IS DISTINCT FROM OLD."released_amount"
  ) THEN
    RAISE EXCEPTION 'usage window % for session % has already released its reservation',
      OLD."window_id", OLD."session_id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "usage_windows_release_once" ON "agents"."usage_windows";
CREATE TRIGGER "usage_windows_release_once"
  BEFORE UPDATE ON "agents"."usage_windows"
  FOR EACH ROW EXECUTE FUNCTION "agents"."usage_windows_release_once"();
