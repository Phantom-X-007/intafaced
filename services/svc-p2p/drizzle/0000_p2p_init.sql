-- svc-p2p · initial schema (§6.2 PEER-TO-PEER + ESCROW)
-- Reversal: 0000_p2p_init.down.sql
--
-- The "p2p" schema itself is created by the database bootstrap
-- (tooling/infra/postgres-init/01-service-schemas.sql), which also grants it to
-- the svc_p2p role. Migrations run as that role and hold no database-level
-- CREATE privilege — so a migration physically cannot reach outside its own
-- schema (§2).
--
-- Every statement is idempotent and re-runnable. CHECK constraints are dropped
-- IF EXISTS before being re-asserted, so tightening one later is an edit here
-- rather than a new migration.
--
-- THE POINT OF THIS FILE: escrowed value lives in svc-ledger, not here. What
-- lives here is the *decision* about where that value goes, and the constraints
-- below exist so that a single trade can only ever have made one such decision.

DO $$ BEGIN
  CREATE TYPE "p2p"."offer_side" AS ENUM ('buy', 'sell');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "p2p"."price_type" AS ENUM ('fixed', 'float');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "p2p"."offer_status" AS ENUM ('active', 'paused', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "p2p"."trade_status" AS ENUM ('created', 'escrowed', 'fiat_sent', 'released', 'cancelled', 'disputed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "p2p"."trade_resolution" AS ENUM ('released', 'refunded', 'voided');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "p2p"."dispute_status" AS ENUM ('open', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "p2p"."dispute_resolution" AS ENUM ('release', 'refund');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── offers ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "p2p"."offers" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "maker_id"       text NOT NULL,
  "side"           "p2p"."offer_side" NOT NULL,
  "asset"          text NOT NULL,
  "fiat_currency"  text NOT NULL,
  "price_type"     "p2p"."price_type" NOT NULL,
  "price"          numeric(38, 18) NOT NULL,
  "min_amt"        numeric(38, 18) NOT NULL,
  "max_amt"        numeric(38, 18) NOT NULL,
  "total_amt"      numeric(38, 18) NOT NULL,
  "remaining_amt"  numeric(38, 18) NOT NULL,
  "methods"        jsonb NOT NULL DEFAULT '[]'::jsonb,
  "terms"          text NOT NULL DEFAULT '',
  "status"         "p2p"."offer_status" NOT NULL DEFAULT 'active',
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "offers_book_idx" ON "p2p"."offers" ("asset", "fiat_currency", "side", "status");
CREATE INDEX IF NOT EXISTS "offers_maker_idx" ON "p2p"."offers" ("maker_id", "status");

-- A zero or negative price makes `fiat_amount` zero or negative, and a
-- zero-amount ledger entry is rejected — so the trade would escrow crypto
-- against a fiat obligation of nothing.
ALTER TABLE "p2p"."offers" DROP CONSTRAINT IF EXISTS "offers_price_positive_ck";
ALTER TABLE "p2p"."offers" ADD CONSTRAINT "offers_price_positive_ck"
  CHECK ("price" > 0);

-- THE BOUNDS LADDER. Inverted bounds make every take either always-valid or
-- never-valid depending on which comparison runs first, and an offer whose
-- per-trade max exceeds its own inventory promises liquidity it does not have.
ALTER TABLE "p2p"."offers" DROP CONSTRAINT IF EXISTS "offers_bounds_ordered_ck";
ALTER TABLE "p2p"."offers" ADD CONSTRAINT "offers_bounds_ordered_ck"
  CHECK ("min_amt" > 0 AND "min_amt" <= "max_amt" AND "max_amt" <= "total_amt");

-- Inventory can be exhausted but never over-drawn. A negative remainder means
-- two takers reserved the same units, and both would escrow against a seller
-- balance that only covers one.
ALTER TABLE "p2p"."offers" DROP CONSTRAINT IF EXISTS "offers_remaining_in_range_ck";
ALTER TABLE "p2p"."offers" ADD CONSTRAINT "offers_remaining_in_range_ck"
  CHECK ("remaining_amt" >= 0 AND "remaining_amt" <= "total_amt");

-- ISO 4217. The registry in packages/config is the authority on which codes we
-- serve; this only catches a column being fed something that is not a code.
ALTER TABLE "p2p"."offers" DROP CONSTRAINT IF EXISTS "offers_fiat_code_ck";
ALTER TABLE "p2p"."offers" ADD CONSTRAINT "offers_fiat_code_ck"
  CHECK ("fiat_currency" ~ '^[A-Z]{3}$');

-- ── p2p_trades ───────────────────────────────────────────────────────────────
-- One taken offer, and the escrow it owns.

CREATE TABLE IF NOT EXISTS "p2p"."p2p_trades" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "offer_id"          uuid NOT NULL REFERENCES "p2p"."offers"("id"),
  "taker_id"          text NOT NULL,
  "maker_id"          text NOT NULL,
  -- The escrow owner. Snapshotted at take so a later offer edit can never
  -- re-point an open escrow at a different person.
  "seller_id"         text NOT NULL,
  "buyer_id"          text NOT NULL,
  "asset"             text NOT NULL,
  "fiat_currency"     text NOT NULL,
  "amount"            numeric(38, 18) NOT NULL,
  "price"             numeric(38, 18) NOT NULL,
  "fiat_amount"       numeric(38, 18) NOT NULL,
  "method"            text NOT NULL,
  "fee_bps"           numeric(8, 0) NOT NULL DEFAULT 0,
  "status"            "p2p"."trade_status" NOT NULL DEFAULT 'created',
  "resolution"        "p2p"."trade_resolution",
  "resolution_reason" text,
  "chat_thread_id"    uuid,
  "deadlines"         jsonb NOT NULL DEFAULT '{}'::jsonb,
  "deadline_at"       timestamptz,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "escrowed_at"       timestamptz,
  "fiat_sent_at"      timestamptz,
  "resolved_at"       timestamptz,
  "settled_at"        timestamptz
);

CREATE INDEX IF NOT EXISTS "p2p_trades_deadline_idx" ON "p2p"."p2p_trades" ("deadline_at");
CREATE INDEX IF NOT EXISTS "p2p_trades_unsettled_idx" ON "p2p"."p2p_trades" ("resolved_at", "settled_at");
CREATE INDEX IF NOT EXISTS "p2p_trades_offer_idx" ON "p2p"."p2p_trades" ("offer_id");
CREATE INDEX IF NOT EXISTS "p2p_trades_seller_idx" ON "p2p"."p2p_trades" ("seller_id", "status");
CREATE INDEX IF NOT EXISTS "p2p_trades_buyer_idx" ON "p2p"."p2p_trades" ("buyer_id", "status");

-- A zero-amount trade cannot be escrowed (the ledger rejects zero-amount
-- entries), so it would sit in `created` forever with no path out.
ALTER TABLE "p2p"."p2p_trades" DROP CONSTRAINT IF EXISTS "p2p_trades_amounts_positive_ck";
ALTER TABLE "p2p"."p2p_trades" ADD CONSTRAINT "p2p_trades_amounts_positive_ck"
  CHECK ("amount" > 0 AND "price" > 0 AND "fiat_amount" > 0);

-- Fees come out of the escrowed amount. Above 100% the buyer would be credited
-- a negative number, which the recipe rejects — but only after the decision was
-- already recorded, which is exactly the wrong order to discover it in.
ALTER TABLE "p2p"."p2p_trades" DROP CONSTRAINT IF EXISTS "p2p_trades_fee_bps_ck";
ALTER TABLE "p2p"."p2p_trades" ADD CONSTRAINT "p2p_trades_fee_bps_ck"
  CHECK ("fee_bps" >= 0 AND "fee_bps" < 10000);

-- Buying from yourself lets one account manufacture a completion record, and a
-- flawless reputation raises limits platform-wide (§6.2 → §4.1).
ALTER TABLE "p2p"."p2p_trades" DROP CONSTRAINT IF EXISTS "p2p_trades_distinct_parties_ck";
ALTER TABLE "p2p"."p2p_trades" ADD CONSTRAINT "p2p_trades_distinct_parties_ck"
  CHECK ("seller_id" <> "buyer_id");

-- ═════════════════════════════════════════════════════════════════════════════
-- THE ESCROW TERMINATION CONSTRAINT — the most important line in this file.
--
-- Every trade is either live with no resolution, or terminal with exactly one.
-- There is no fourth combination, so:
--
--   · a terminal trade can never be re-resolved (the service refuses, and a row
--     that got past it would still have to pick ONE resolution here);
--   · "released to both parties" is not a race to lose, it is a state that
--     cannot be written down;
--   · a released trade is a released trade — 'released' status and 'refunded'
--     resolution cannot coexist on one row.
--
-- Combined with the ledger's business-key idempotency
-- (`p2p.escrow.release:<tradeId>`), locked funds reach exactly one terminal
-- state exactly once.
-- ═════════════════════════════════════════════════════════════════════════════
ALTER TABLE "p2p"."p2p_trades" DROP CONSTRAINT IF EXISTS "p2p_trades_resolution_matches_status_ck";
ALTER TABLE "p2p"."p2p_trades" ADD CONSTRAINT "p2p_trades_resolution_matches_status_ck"
  CHECK (
    ("status" = 'released'  AND "resolution" = 'released')
    OR ("status" = 'cancelled' AND "resolution" IN ('refunded', 'voided'))
    OR ("status" IN ('created', 'escrowed', 'fiat_sent', 'disputed') AND "resolution" IS NULL)
  );

-- The decision is recorded BEFORE the ledger post that acts on it, never after.
-- A settled trade with no recorded resolution would be value that moved with no
-- audit trail explaining why — §5's whole point.
ALTER TABLE "p2p"."p2p_trades" DROP CONSTRAINT IF EXISTS "p2p_trades_settled_implies_resolved_ck";
ALTER TABLE "p2p"."p2p_trades" ADD CONSTRAINT "p2p_trades_settled_implies_resolved_ck"
  CHECK ("settled_at" IS NULL OR ("resolved_at" IS NOT NULL AND "resolution" IS NOT NULL));

-- A terminal trade carries no deadline, so the timeout sweeper physically
-- cannot pick up a trade it would try to resolve a second time.
ALTER TABLE "p2p"."p2p_trades" DROP CONSTRAINT IF EXISTS "p2p_trades_terminal_has_no_deadline_ck";
ALTER TABLE "p2p"."p2p_trades" ADD CONSTRAINT "p2p_trades_terminal_has_no_deadline_ck"
  CHECK ("resolution" IS NULL OR "deadline_at" IS NULL);

-- The mirror of it: a LIVE trade must always carry a deadline. This is the
-- constraint that makes "a trade sits in escrow forever" unrepresentable — an
-- open trade with a NULL deadline is invisible to the sweeper, and invisible to
-- the sweeper is exactly what stranded funds look like.
ALTER TABLE "p2p"."p2p_trades" DROP CONSTRAINT IF EXISTS "p2p_trades_live_has_deadline_ck";
ALTER TABLE "p2p"."p2p_trades" ADD CONSTRAINT "p2p_trades_live_has_deadline_ck"
  CHECK ("resolution" IS NOT NULL OR "deadline_at" IS NOT NULL);

-- Escrow is what makes a trade real. Anything past `created` must carry the
-- timestamp of the lock — unless it was voided, which is precisely the case
-- where no lock ever happened.
--
-- `IS NOT DISTINCT FROM`, not `=`: a NULL resolution would make the whole OR
-- chain NULL, and a CHECK that evaluates to NULL passes. A three-valued
-- accident is not a constraint.
ALTER TABLE "p2p"."p2p_trades" DROP CONSTRAINT IF EXISTS "p2p_trades_escrow_timestamp_ck";
ALTER TABLE "p2p"."p2p_trades" ADD CONSTRAINT "p2p_trades_escrow_timestamp_ck"
  CHECK (
    "status" = 'created'
    OR "escrowed_at" IS NOT NULL
    OR "resolution" IS NOT DISTINCT FROM 'voided'
  );

-- A resolution is a decision, and a decision happened at a time. One without
-- the other is an audit trail with a hole in it.
ALTER TABLE "p2p"."p2p_trades" DROP CONSTRAINT IF EXISTS "p2p_trades_resolved_at_paired_ck";
ALTER TABLE "p2p"."p2p_trades" ADD CONSTRAINT "p2p_trades_resolved_at_paired_ck"
  CHECK (("resolution" IS NULL) = ("resolved_at" IS NULL));

-- ── p2p_disputes ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "p2p"."p2p_disputes" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "trade_id"          uuid NOT NULL REFERENCES "p2p"."p2p_trades"("id"),
  "opened_by"         text NOT NULL,
  "reason"            text NOT NULL DEFAULT '',
  -- APPEND-ONLY. A jsonb ARRAY of attributed envelopes — see the trigger below.
  "evidence"          jsonb NOT NULL DEFAULT '[]'::jsonb,
  "moderator_id"      text,
  "resolution"        "p2p"."dispute_resolution",
  "resolution_notes"  text,
  "status"            "p2p"."dispute_status" NOT NULL DEFAULT 'open',
  "deadline_at"       timestamptz NOT NULL,
  "opened_at"         timestamptz NOT NULL DEFAULT now(),
  "resolved_at"       timestamptz,
  -- Written by the statement that SERVES this dispute to a moderator, and by no
  -- other. It is the only fact in the schema that distinguishes "a queue exists"
  -- from "a human reached this row".
  "last_seen_by_moderator_at" timestamptz,
  "moderator_views"   integer NOT NULL DEFAULT 0,
  -- The SLA breached and the dispute was re-armed rather than disposed of.
  "escalated_at"      timestamptz,
  "escalations"       integer NOT NULL DEFAULT 0
);

-- The four columns above post-date the first cut of this table, and
-- `CREATE TABLE IF NOT EXISTS` above is a no-op on a database that already has
-- it. Re-runnability is a property of the FILE, not of one statement in it.
ALTER TABLE "p2p"."p2p_disputes" ADD COLUMN IF NOT EXISTS "last_seen_by_moderator_at" timestamptz;
ALTER TABLE "p2p"."p2p_disputes" ADD COLUMN IF NOT EXISTS "moderator_views" integer NOT NULL DEFAULT 0;
ALTER TABLE "p2p"."p2p_disputes" ADD COLUMN IF NOT EXISTS "escalated_at" timestamptz;
ALTER TABLE "p2p"."p2p_disputes" ADD COLUMN IF NOT EXISTS "escalations" integer NOT NULL DEFAULT 0;

-- ONE DISPUTE PER TRADE, EVER. Two dispute rows means two moderators can reach
-- two different decisions about one escrow, and both would look legitimate.
CREATE UNIQUE INDEX IF NOT EXISTS "p2p_disputes_trade_idx" ON "p2p"."p2p_disputes" ("trade_id");
-- THE MODERATOR QUEUE. `disputes.list` orders by exactly this: open first, most
-- overdue first. Until that procedure existed the index was carried by nothing.
CREATE INDEX IF NOT EXISTS "p2p_disputes_open_idx" ON "p2p"."p2p_disputes" ("status", "deadline_at");

-- A resolved dispute names the moderator, the decision, and the time. §5: the
-- audit trail has to explain every movement, and "resolved by nobody, somehow"
-- explains nothing.
ALTER TABLE "p2p"."p2p_disputes" DROP CONSTRAINT IF EXISTS "p2p_disputes_resolved_is_attributed_ck";
ALTER TABLE "p2p"."p2p_disputes" ADD CONSTRAINT "p2p_disputes_resolved_is_attributed_ck"
  CHECK (
    ("status" = 'open' AND "resolution" IS NULL AND "resolved_at" IS NULL)
    OR ("status" = 'resolved' AND "resolution" IS NOT NULL AND "moderator_id" IS NOT NULL AND "resolved_at" IS NOT NULL)
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- A DISPUTED ESCROW TERMINATES ONLY ON A HUMAN RULING.
--
-- SPEC-OTC: "No automated resolution of a disputed release — this is the one
-- place in the platform where a human decision is the correct design, not a
-- fallback." The service used to contradict that with a 7-day timer that
-- refunded, attributed to `system:p2p-backstop`.
--
-- The service no longer has that path. This trigger is why it cannot come back
-- by accident: from `disputed`, writing a resolution requires the trade's
-- dispute row to already be `resolved` and attributed to a moderator id that is
-- NOT a `system:` principal. A timer cannot satisfy that without impersonating
-- a person, which is a thing a reviewer would see rather than a default nobody
-- read.
--
-- It is deliberately narrow: it says nothing about `escrowed`/`fiat_sent`
-- timeouts, which resolve on a clock and should — nobody is disagreeing there.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION "p2p"."p2p_trades_disputed_needs_ruling"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  d_status text;
  d_moderator text;
BEGIN
  IF OLD."status" = 'disputed' AND OLD."resolution" IS NULL AND NEW."resolution" IS NOT NULL THEN
    SELECT "status"::text, "moderator_id" INTO d_status, d_moderator
      FROM "p2p"."p2p_disputes" WHERE "trade_id" = NEW."id";

    IF d_status IS DISTINCT FROM 'resolved'
       OR d_moderator IS NULL
       OR d_moderator LIKE 'system:%' THEN
      RAISE EXCEPTION
        'p2p: a disputed escrow terminates only on a human ruling — trade % has no attributed moderator decision', NEW."id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "p2p_trades_disputed_needs_ruling_trg" ON "p2p"."p2p_trades";
CREATE TRIGGER "p2p_trades_disputed_needs_ruling_trg"
  BEFORE UPDATE ON "p2p"."p2p_trades"
  FOR EACH ROW EXECUTE FUNCTION "p2p"."p2p_trades_disputed_needs_ruling"();

-- ── Evidence is append-only ──────────────────────────────────────────────────
--
-- Evidence is the record of a dispute. A record that can be edited after the
-- fact is not a record, it is a draft — and the party who can edit it last wins
-- every disagreement about what was submitted.
--
-- Shape first: a jsonb ARRAY, bounded in both count and bytes, so "append"
-- means something and an operator regex or a runaway client cannot make one row
-- the size of the table.
ALTER TABLE "p2p"."p2p_disputes" DROP CONSTRAINT IF EXISTS "p2p_disputes_evidence_is_array_ck";
ALTER TABLE "p2p"."p2p_disputes" ADD CONSTRAINT "p2p_disputes_evidence_is_array_ck"
  CHECK (jsonb_typeof("evidence") = 'array' AND jsonb_array_length("evidence") <= 200);

ALTER TABLE "p2p"."p2p_disputes" DROP CONSTRAINT IF EXISTS "p2p_disputes_evidence_bounded_ck";
ALTER TABLE "p2p"."p2p_disputes" ADD CONSTRAINT "p2p_disputes_evidence_bounded_ck"
  CHECK (pg_column_size("evidence") <= 262144);

-- Then the rule itself. Not "the service only appends" — that is a sentence in
-- a code review. This is the database refusing any update whose evidence is not
-- the old evidence with entries added on the end: no edit, no reorder, no
-- removal, from any client, including psql.
CREATE OR REPLACE FUNCTION "p2p"."p2p_disputes_evidence_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  kept jsonb;
BEGIN
  IF NEW."evidence" IS NOT DISTINCT FROM OLD."evidence" THEN
    RETURN NEW;
  END IF;

  IF jsonb_array_length(NEW."evidence") < jsonb_array_length(OLD."evidence") THEN
    RAISE EXCEPTION 'p2p: dispute evidence is append-only — % entries cannot become %',
      jsonb_array_length(OLD."evidence"), jsonb_array_length(NEW."evidence")
      USING ERRCODE = 'check_violation';
  END IF;

  -- The prefix of the new array, of the old array's length, must BE the old
  -- array. `COALESCE` because jsonb_agg over zero rows is NULL, and the very
  -- first append is exactly that case.
  SELECT COALESCE(jsonb_agg(e ORDER BY ord), '[]'::jsonb) INTO kept
    FROM jsonb_array_elements(NEW."evidence") WITH ORDINALITY AS t(e, ord)
   WHERE ord <= jsonb_array_length(OLD."evidence");

  IF kept IS DISTINCT FROM OLD."evidence" THEN
    RAISE EXCEPTION 'p2p: dispute evidence is append-only — entry % or earlier was altered', 1
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "p2p_disputes_evidence_append_only_trg" ON "p2p"."p2p_disputes";
CREATE TRIGGER "p2p_disputes_evidence_append_only_trg"
  BEFORE UPDATE ON "p2p"."p2p_disputes"
  FOR EACH ROW EXECUTE FUNCTION "p2p"."p2p_disputes_evidence_append_only"();

-- ── p2p_reputation ───────────────────────────────────────────────────────────
-- §6.2: completion rate, average release time, disputes lost — feeding the same
-- XP graph as everything else (§4.1).

CREATE TABLE IF NOT EXISTS "p2p"."p2p_reputation" (
  "user_id"            text PRIMARY KEY,
  "trades_total"       integer NOT NULL DEFAULT 0,
  "completed"          integer NOT NULL DEFAULT 0,
  "cancelled"          integer NOT NULL DEFAULT 0,
  "disputed"           integer NOT NULL DEFAULT 0,
  "disputes_lost"      integer NOT NULL DEFAULT 0,
  "completion_rate"    numeric(6, 4) NOT NULL DEFAULT 0,
  "total_release_secs" bigint NOT NULL DEFAULT 0,
  "release_samples"    integer NOT NULL DEFAULT 0,
  "avg_release_secs"   integer NOT NULL DEFAULT 0,
  "badges"             text[] NOT NULL DEFAULT '{}',
  "updated_at"         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "p2p_reputation_completed_idx" ON "p2p"."p2p_reputation" ("completed");

-- Negative counters would invert the completion rate, and rank perks read that
-- number to set P2P limits (§4.1 `p2pLimitMultiplier`).
ALTER TABLE "p2p"."p2p_reputation" DROP CONSTRAINT IF EXISTS "p2p_reputation_counters_non_negative_ck";
ALTER TABLE "p2p"."p2p_reputation" ADD CONSTRAINT "p2p_reputation_counters_non_negative_ck"
  CHECK (
    "trades_total" >= 0 AND "completed" >= 0 AND "cancelled" >= 0
    AND "disputed" >= 0 AND "disputes_lost" >= 0
    AND "release_samples" >= 0 AND "total_release_secs" >= 0 AND "avg_release_secs" >= 0
  );

-- A rate outside 0..1 is a counter bug that would otherwise surface as a badge
-- and a raised limit rather than as an error.
ALTER TABLE "p2p"."p2p_reputation" DROP CONSTRAINT IF EXISTS "p2p_reputation_rate_in_range_ck";
ALTER TABLE "p2p"."p2p_reputation" ADD CONSTRAINT "p2p_reputation_rate_in_range_ck"
  CHECK ("completion_rate" >= 0 AND "completion_rate" <= 1);

-- You cannot have completed more trades than you have had, and you cannot lose
-- more disputes than you were in.
ALTER TABLE "p2p"."p2p_reputation" DROP CONSTRAINT IF EXISTS "p2p_reputation_counters_conserved_ck";
ALTER TABLE "p2p"."p2p_reputation" ADD CONSTRAINT "p2p_reputation_counters_conserved_ck"
  CHECK ("completed" + "cancelled" <= "trades_total" AND "disputes_lost" <= "disputed");
