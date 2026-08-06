-- Reversal of 0003_p2p_dispute_ruling_invariant.sql.
--
-- NOT tagged `intafaced:destructive`: this drops no table, no column and no
-- row. It is a loss of protection, not a loss of data — but it is a large one,
-- and it is easy to read a file made of DROPs as harmless, so what it costs is
-- named here rather than left to be rediscovered.
--
-- Afterwards, all three of these are true again:
--
--   · a disputed trade can be moved to `escrowed` and then terminated, because
--     the guard reads OLD.status from ONE statement. Escrow refunded, dispute
--     row still `open`, nobody ruled;
--   · `System:p2p-backstop`, `automation:p2p` and `p2p-backstop` are all
--     accepted as the moderator who ruled, because the check goes back to a
--     case-sensitive denylist of one lowercase prefix;
--   · a dispute record — the account two people gave of a disagreement — can be
--     deleted.
--
-- It exists so the migration is provably reversible in CI (§14 DoD 1). Do not
-- run it against a database holding escrow.

-- Back to the 0000 guard, verbatim.
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

DROP TRIGGER IF EXISTS "p2p_disputes_no_delete_trg" ON "p2p"."p2p_disputes";
DROP FUNCTION IF EXISTS "p2p"."p2p_disputes_no_delete"();

-- After the trigger function, because the constraint and the function above
-- both depended on it.
ALTER TABLE "p2p"."p2p_disputes" DROP CONSTRAINT IF EXISTS "p2p_disputes_moderator_is_a_person_ck";
DROP FUNCTION IF EXISTS "p2p"."is_natural_person_id"(text);
