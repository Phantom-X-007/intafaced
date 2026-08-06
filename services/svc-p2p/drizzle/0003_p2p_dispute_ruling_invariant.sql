-- svc-p2p · a disputed escrow terminates only on an attributed human ruling.
-- Reversal: 0003_p2p_dispute_ruling_invariant.down.sql
--
-- NOT tagged `intafaced:destructive`: it drops no table, no column and no row,
-- and the one DELETE guard it adds only ever refuses.
--
--
-- WHAT WAS WRONG
--
-- `0000` states the invariant in a comment — "a disputed escrow terminates only
-- on a human ruling" — and then enforces something narrower than the sentence:
--
--   IF OLD."status" = 'disputed' AND OLD."resolution" IS NULL AND NEW."resolution" IS NOT NULL
--
-- Two ways past it, both reproduced at the SQL level against a database with
-- `0000` and `0001` applied, both green, neither touching a line of TypeScript:
--
-- 1 · TWO-STEP UN-DISPUTE. `OLD.status = 'disputed'` is a fact about ONE
--     statement, and nothing said a disputed trade may not stop being disputed.
--
--       UPDATE p2p_trades SET status = 'escrowed'  WHERE …;
--         -- the trigger fires and sleeps: NEW.resolution is still NULL
--       UPDATE p2p_trades SET status = 'cancelled', resolution = 'refunded' …;
--         -- OLD.status is 'escrowed' now, so the guard never runs
--
--     Result: escrow refunded, dispute row still `open`, no moderator, no
--     ruling. The backstop timer this trigger exists to keep out needs two
--     statements instead of one.
--
-- 2 · SPELLING. `d_moderator LIKE 'system:%'` is a DENYLIST of one string, and
--     it is case-sensitive. `System:p2p-backstop` passes it. So does
--     `automation:p2p`. So does `p2p-backstop`, which claims no namespace at
--     all. The rule was never "a person ruled"; it was "the string starts with
--     nine particular lowercase characters", and a denylist of spellings is
--     beaten by the next spelling.
--
--
-- WHAT IS ENFORCED NOW — the property, not the spelling
--
-- **A trade that is under dispute cannot reach a terminal state without a
-- ruling that is recorded, resolved, and attributed to a natural person.**
--
-- Three changes, each closing one leg, and each meaningful on its own:
--
-- A · UNDER DISPUTE is no longer read off one statement's OLD.status. A trade
--     is under dispute if it is `disputed` now, WAS `disputed` before this
--     statement, or carries a dispute row at all. The dispute row is the
--     durable fact — `p2p_disputes_trade_idx` makes it one per trade, ever — so
--     un-disputing first no longer disarms anything. Both halves of the OR are
--     load-bearing: dropping the row half restores bypass 1, and dropping the
--     status half would let someone DELETE the dispute row instead, which is
--     why the row is also no longer deletable (D below).
--
-- B · A disputed trade may not leave `disputed` for a live state at all. This
--     is the state machine `src/state.ts` already declares — `disputed` has
--     exactly two edges out and both are terminal — asserted where a psql
--     session cannot route around it. It makes bypass 1 fail on its FIRST
--     statement rather than its second, which matters: a refusal at the point
--     of the lie names the lie.
--
-- C · WHO MAY RULE IS AN ALLOWLIST. `moderator_id` must be a lowercase
--     canonical UUID — the natural-person identifier space, the same one
--     `seller_id`, `buyer_id` and `opened_by` are drawn from, and the one
--     `svc-ledger/drizzle/0005_owner_identifier_space.sql` §4.2 already makes
--     law for account owners. Machine principals live in the OTHER space there
--     (`fees:trade`, a namespaced slug) and cannot be mistaken for this one.
--
--     This is the substantive judgement in the file, so it is worth stating why
--     an allowlist beats the denylist it replaces. A denylist has to enumerate
--     the ways a machine might name itself, and it is wrong the moment someone
--     invents a tenth — every one of `System:`, `automation:`, `svc-p2p`,
--     `backstop`, `cron`, `''` and `-` defeated the old rule, and none of them
--     is exotic. An allowlist has to enumerate the ways a PERSON is named, and
--     there is exactly one here: the id the access token carries, which is a
--     `identity.users.id` uuid rendered lowercase by Postgres, by
--     `crypto.randomUUID()` and by `UUID.toString()` alike. The set of legal
--     values is closed and known; the set of illegal ones never was.
--
--     Lowercase specifically, not case-insensitively, and that is the same
--     decision 0005 STEP 1 made: `550E8400-…` and `550e8400-…` are one person
--     and two strings, and accepting both is how a case bypass gets in through
--     the identifier instead of through the namespace.
--
--     The rule is a named function rather than an inline regex so that the
--     trigger, the CHECK below and `src/p2p-service.ts` are provably asking one
--     question. Application code asks it first for a legible error; this is
--     what makes it true.
--
-- D · THE DISPUTE RECORD IS NOT DELETABLE. With A in place, the remaining way
--     to make a trade stop being under dispute is to delete the row that says
--     it is. A dispute is the record of two people disagreeing and the evidence
--     they filed — §5, and `p2p_disputes_evidence_append_only_trg` in 0000
--     already refuses to let the evidence inside it be rewritten. Deleting the
--     envelope was never covered. Nothing in this service deletes a dispute;
--     `erasure.ts` retains them by name and says so in its manifest.
--
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
-- It says nothing about `escrowed` / `fiat_sent` timeouts, which resolve on a
-- clock and should — nobody is disagreeing there, and `state.ts` explains why
-- that asymmetry is the guarantee rather than a hole in it.
--
-- It does not require a moderator to have READ the dispute before ruling.
-- `last_seen_by_moderator_at` is the only column that distinguishes "a queue
-- exists" from "a human reached this row" and it is tempting to require it —
-- but `resolveDispute` does not stamp it, `disputes.get` does, and making a
-- ruling conditional on a prior read is a product decision about the moderator
-- workflow rather than a repair of this invariant. Named here so the next
-- reader knows it was weighed rather than missed.
--
--
-- WHY 0003 AND NOT AN EDIT TO 0000
--
-- `scripts/migrate.ts` tracks applied migrations BY FILENAME in
-- `p2p.__migrations`. `0000` uses `CREATE OR REPLACE FUNCTION`, so editing it
-- would look like it worked — and would never run again on any database that
-- already applied it. The constraint would exist only on databases created
-- after the edit: green tests, unprotected table. Same reasoning `0002` records
-- for `0001`.

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 · THE IDENTIFIER-SPACE RULE, as one named function.

CREATE OR REPLACE FUNCTION "p2p"."is_natural_person_id"("id" text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  -- Lowercase canonical UUID and nothing else. See section C of the header for
  -- why this is an allowlist, and svc-ledger 0005 for the identifier space it
  -- belongs to.
  SELECT "id" IS NOT NULL
     AND "id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 · REFUSE TO CONSTRAIN A TABLE THAT ALREADY VIOLATES IT.
--
-- A constraint added ahead of its backfill passes on an empty database and
-- fails on a populated one — a deploy that stops mid-flight rather than a test
-- that goes red (svc-ledger 0005 records the same order for the same reason).
--
-- There is no backfill available here and there must not be one. The offending
-- value would be an ATTRIBUTION: a row saying who ruled on somebody's escrow.
-- Rewriting it to make a constraint pass would be forging the audit trail in
-- the migration that exists to protect it. So this refuses and says what it
-- found; disposing of such a row is an owner action with a human attached.
DO $$
DECLARE
  bad bigint;
  sample text;
BEGIN
  SELECT count(*), min("moderator_id") INTO bad, sample
    FROM "p2p"."p2p_disputes"
   WHERE "moderator_id" IS NOT NULL
     AND NOT "p2p"."is_natural_person_id"("moderator_id");

  IF bad > 0 THEN
    RAISE EXCEPTION
      'Cannot apply 0003: % dispute row(s) are attributed to a moderator_id outside the natural-person '
      'identifier space (for example %). Each one is an escrow decision recorded against something that is '
      'not a person — most likely the removed `system:p2p-backstop` timer. This migration will not rewrite an '
      'attribution to make itself pass: that is forging the audit trail (Doctrine 5). Resolve each row with a '
      'named human first.', bad, sample;
  END IF;
END $$;

ALTER TABLE "p2p"."p2p_disputes" DROP CONSTRAINT IF EXISTS "p2p_disputes_moderator_is_a_person_ck";
ALTER TABLE "p2p"."p2p_disputes" ADD CONSTRAINT "p2p_disputes_moderator_is_a_person_ck"
  CHECK ("moderator_id" IS NULL OR "p2p"."is_natural_person_id"("moderator_id"));

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 · THE TRIGGER, restated as the property.

CREATE OR REPLACE FUNCTION "p2p"."p2p_trades_disputed_needs_ruling"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  d_exists boolean;
  d_status text;
  d_moderator text;
BEGIN
  -- `SELECT true, …` rather than testing FOUND afterwards: FOUND is set by the
  -- last statement that touched rows, and a guard whose correctness depends on
  -- no other statement having run since is a guard waiting for an edit.
  SELECT true, "status"::text, "moderator_id"
    INTO d_exists, d_status, d_moderator
    FROM "p2p"."p2p_disputes" WHERE "trade_id" = NEW."id";

  -- UNDER DISPUTE — three ways to be, so that changing status first does not
  -- change the answer. See section A.
  IF NOT (OLD."status" = 'disputed' OR NEW."status" = 'disputed' OR coalesce(d_exists, false)) THEN
    RETURN NEW;
  END IF;

  -- (B) A disputed trade may not quietly stop being disputed. Every legitimate
  -- edge out of `disputed` is terminal and carries a resolution, which is what
  -- (C) below then adjudicates — so "leaving `disputed` with NEW.resolution
  -- still NULL" is exactly the un-dispute step and nothing else.
  IF OLD."status" = 'disputed' AND NEW."status" <> 'disputed' AND NEW."resolution" IS NULL THEN
    RAISE EXCEPTION
      'p2p: trade % is disputed and cannot return to a live state — the only edges out of `disputed` are '
      'released and cancelled, and both require an attributed human ruling. Un-disputing first was how a '
      'backstop timer terminated an escrow in two statements instead of one', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;

  -- (C) The terminal write itself.
  IF OLD."resolution" IS NULL AND NEW."resolution" IS NOT NULL THEN
    IF NOT coalesce(d_exists, false) THEN
      -- OLD.status was 'disputed' but the dispute row is gone. Step D makes
      -- this unreachable by DELETE; it is kept because "the record vanished"
      -- must never be the quiet path to a resolution.
      RAISE EXCEPTION
        'p2p: trade % was disputed and its dispute record is missing — an escrow cannot terminate on a ruling '
        'that no longer exists', NEW."id"
        USING ERRCODE = 'check_violation';
    END IF;

    IF d_status IS DISTINCT FROM 'resolved'
       OR NOT "p2p"."is_natural_person_id"(d_moderator) THEN
      RAISE EXCEPTION
        'p2p: a disputed escrow terminates only on a human ruling — trade % has no attributed moderator '
        'decision (dispute is %, ruled by %). The moderator must be a natural-person id: a lowercase '
        'canonical UUID, the same identifier space as the two parties. A machine principal is not one, '
        'whatever it is called', NEW."id", coalesce(d_status, 'absent'), coalesce(d_moderator, 'nobody')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- The trigger itself is unchanged from 0000 and is re-created only so this file
-- is self-contained on a database where 0000 has been reversed.
DROP TRIGGER IF EXISTS "p2p_trades_disputed_needs_ruling_trg" ON "p2p"."p2p_trades";
CREATE TRIGGER "p2p_trades_disputed_needs_ruling_trg"
  BEFORE UPDATE ON "p2p"."p2p_trades"
  FOR EACH ROW EXECUTE FUNCTION "p2p"."p2p_trades_disputed_needs_ruling"();

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 · THE DISPUTE RECORD IS NOT DELETABLE.

CREATE OR REPLACE FUNCTION "p2p"."p2p_disputes_no_delete"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'p2p: a dispute record cannot be deleted — dispute % on trade % is the account two people gave of a '
    'disagreement, and the evidence inside it is already append-only. Deleting it would also be the last way '
    'to make a disputed trade stop being under dispute', OLD."id", OLD."trade_id"
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS "p2p_disputes_no_delete_trg" ON "p2p"."p2p_disputes";
CREATE TRIGGER "p2p_disputes_no_delete_trg"
  BEFORE DELETE ON "p2p"."p2p_disputes"
  FOR EACH ROW EXECUTE FUNCTION "p2p"."p2p_disputes_no_delete"();
