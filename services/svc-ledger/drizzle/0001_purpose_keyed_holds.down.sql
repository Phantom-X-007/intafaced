-- Reverses 0001_purpose_keyed_holds.sql
--
-- NOTE ON DATA LOSS, because a reversal that quietly destroys money is worse
-- than one that refuses.
--
-- Going back means collapsing every purpose-keyed hold for a (user, asset) into
-- one row. If more than one purposed hold carries a non-zero balance, that
-- collapse would either violate the old unique index or silently merge two
-- reservations into a single indistinguishable pot — re-creating P0-3 and
-- losing the record of which order the value belonged to.
--
-- So this refuses rather than guesses. Zero the holds first if you genuinely
-- need to roll back.
DO $$
DECLARE
  offending bigint;
BEGIN
  SELECT count(*) INTO offending
    FROM (
      SELECT 1
        FROM "ledger"."accounts"
       WHERE "kind" = 'hold' AND "balance" <> 0
       GROUP BY "owner_type", "owner_id", "asset_id"
      HAVING count(*) > 1
    ) dupes;

  IF offending > 0 THEN
    RAISE EXCEPTION
      'Cannot reverse 0001: % (owner, asset) pair(s) hold non-zero balances under more than one purpose. '
      'Collapsing them would merge distinct reservations into one bucket and lose which is which (P0-3). '
      'Settle or release those holds first.', offending;
  END IF;
END $$;

DROP INDEX IF EXISTS "ledger"."accounts_hold_purpose_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "accounts_identity_idx"
  ON "ledger"."accounts" ("owner_type", "owner_id", "asset_id", "kind");

DROP INDEX IF EXISTS "ledger"."accounts_identity_purpose_idx";

ALTER TABLE "ledger"."accounts" DROP CONSTRAINT IF EXISTS "accounts_hold_purposed_ck";
ALTER TABLE "ledger"."accounts" DROP CONSTRAINT IF EXISTS "accounts_purpose_len_ck";
ALTER TABLE "ledger"."accounts" DROP COLUMN IF EXISTS "purpose";
