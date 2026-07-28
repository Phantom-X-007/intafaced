-- intafaced:destructive — reversal of 0002_durable_freeze.sql
--
-- Dropping this table hands the freeze back to process memory, which means the
-- next restart resumes posting. If the ledger is frozen RIGHT NOW, that is not
-- a rollback — it is an unfreeze performed by a schema change, with no operator
-- and no record, against a book somebody deliberately halted.
--
-- So this refuses instead of guessing, the same way 0001's reversal refuses to
-- merge two purposed holds. Thaw it deliberately first (`unfreeze`, which names
-- an actor and emits `intafaced.ledger.freeze.updated`) and then roll back.
DO $$
DECLARE
  frozen_reason text;
BEGIN
  SELECT "reason" INTO frozen_reason
    FROM "ledger"."posting_freeze"
   WHERE "id" = true AND "frozen" = true;

  IF FOUND THEN
    RAISE EXCEPTION
      'Cannot reverse 0002: ledger posting is frozen (%). Dropping posting_freeze would resume posting on the '
      'next restart with nobody having decided to. Unfreeze deliberately first, then roll back.',
      coalesce(frozen_reason, 'no reason recorded');
  END IF;
END $$;

DROP TABLE IF EXISTS "ledger"."posting_freeze";
