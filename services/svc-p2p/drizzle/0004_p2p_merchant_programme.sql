-- THE P2P MERCHANT PROGRAMME — §6.2's fifth table, and its history.
--
-- `TRK-p2p.merchants.md` Stage 1: "p2p_merchants migration + apply/approve
-- state machine". Badges and limit ENFORCEMENT are Stage 2; this is the
-- membership record they will read.
--
-- WHY A SEPARATE TABLE AND NOT A FLAG ON THE USER
--
-- Merchant standing is not an attribute of a person, it is a decision somebody
-- made about them on a date for a reason. `p2p_reputation` already holds what a
-- trader EARNED; this holds what an operator GRANTED. Collapsing the two would
-- make "why is this account a merchant" unanswerable, and would let a
-- reputation recompute silently promote or demote someone.
--
-- The spec's second DoD line is the one that shapes this schema: limits and
-- badges must derive from "reputation + explicit programme rules, not a fresh
-- account borrowing merchant trust". So membership is explicit and dated, and
-- the eligibility snapshot that justified it is stored ON the application row —
-- because reputation moves, and a decision has to remain readable against the
-- numbers that were true when it was taken.

DO $$ BEGIN
  CREATE TYPE "p2p"."merchant_status" AS ENUM ('applied', 'approved', 'rejected', 'suspended', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "p2p"."p2p_merchants" (
  "user_id"     text PRIMARY KEY,
  "status"      "p2p"."merchant_status" NOT NULL DEFAULT 'applied',
  -- The reputation snapshot at APPLICATION time, as decimal strings and counts.
  -- Stored, not recomputed: an approval has to stay explicable after the
  -- applicant trades again, and a reviewer looking at a decision needs the
  -- numbers the decider saw rather than today's.
  "applied_completion_rate" numeric(5, 4) NOT NULL,
  "applied_trades_total"    integer NOT NULL,
  "applied_at"  timestamptz NOT NULL DEFAULT now(),
  "decided_at"  timestamptz,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "p2p_merchants_applied_rate_range" CHECK ("applied_completion_rate" >= 0 AND "applied_completion_rate" <= 1),
  CONSTRAINT "p2p_merchants_applied_trades_nonneg" CHECK ("applied_trades_total" >= 0),
  -- A decided row must say when. `applied` is the only status with no decision.
  CONSTRAINT "p2p_merchants_decided_at_present" CHECK (
    ("status" = 'applied' AND "decided_at" IS NULL) OR ("status" <> 'applied' AND "decided_at" IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS "p2p_merchants_status_idx" ON "p2p"."p2p_merchants" ("status");

-- ── The history, same shape and same reasons as pay.merchant_status_events ───
--
-- svc-pay's ADR put it best: an operator must be able to answer "why is this
-- merchant suspended" from the database. A status column alone cannot, and a
-- merchant whose standing changes without a record is one nobody can defend a
-- decision about — including to the merchant.

CREATE TABLE IF NOT EXISTS "p2p"."p2p_merchant_events" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- `bigserial`, because `now()` inside a transaction is the TRANSACTION's start
  -- time: two transitions written by one statement share a timestamp and cannot
  -- be ordered by it. A history that cannot say which change came first is not
  -- a history.
  "seq"         bigserial NOT NULL,
  "user_id"     text NOT NULL REFERENCES "p2p"."p2p_merchants"("user_id") ON DELETE CASCADE,
  -- BOTH SIDES of the transition. Storing only `to_status` makes the first row
  -- unreadable — there is nothing before it to compare against — and makes a
  -- gap in the chain invisible instead of detectable.
  "from_status" "p2p"."merchant_status" NOT NULL,
  "to_status"   "p2p"."merchant_status" NOT NULL,
  -- REQUIRED, and free text. An enum of reasons forces every real situation
  -- into whichever of five codes is least wrong, and the actual explanation
  -- goes into a ticket nobody keeps.
  "reason"      text NOT NULL CONSTRAINT "p2p_merchant_events_reason_not_blank" CHECK (length(btrim("reason")) > 0),
  -- WHO, from the authenticated principal — never from a request body, or the
  -- field records who the caller SAID they were. Self-service transitions
  -- (apply, withdraw) record the applicant; operator decisions record the operator.
  "actor_id"    text NOT NULL,
  -- WHAT AUTHORISED IT. Scope law changes over time, and "this was done under
  -- p2p:moderate in August" is a different fact from "whoever did this would
  -- need p2p:moderate today".
  "actor_scope" text NOT NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "p2p_merchant_events_seq_idx"
  ON "p2p"."p2p_merchant_events" ("seq");
CREATE INDEX IF NOT EXISTS "p2p_merchant_events_user_idx"
  ON "p2p"."p2p_merchant_events" ("user_id", "seq" DESC);

-- APPEND-ONLY, ENFORCED BY THE DATABASE.
--
-- A history that can be edited is worse than none: it looks like evidence and
-- is not. Correcting a wrong suspension is a NEW row, the way a ledger reverses
-- a posting.
CREATE OR REPLACE FUNCTION "p2p"."p2p_merchant_events_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'p2p.p2p_merchant_events is append-only: % is not permitted. Reinstate with a new row, do not edit the old one.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS "p2p_merchant_events_append_only_trg" ON "p2p"."p2p_merchant_events";
CREATE TRIGGER "p2p_merchant_events_append_only_trg"
  BEFORE UPDATE OR DELETE ON "p2p"."p2p_merchant_events"
  FOR EACH ROW EXECUTE FUNCTION "p2p"."p2p_merchant_events_append_only"();
