-- Reverse of 0002. Restores the pre-claim schema exactly: the exact-equality
-- unique index comes back, and the lifecycle column goes.
--
-- intafaced:destructive drops `status`, which is a claim-lifecycle column and
-- not an audit trail — every reachable row is `settled` once its burn is on the
-- ledger, and the burn itself lives in the ledger, not here. Reversing this
-- migration also restores the ordering bug it exists to fix, so it is a
-- rollback of last resort.

DROP INDEX IF EXISTS "token"."buyback_runs_status_idx";

ALTER TABLE "token"."buyback_runs" DROP CONSTRAINT IF EXISTS "buyback_runs_window_no_overlap_ex";

-- Restore the weaker exact-equality guard that 0002 replaced. This can fail if
-- overlapping-but-not-identical rows were written while 0002 was applied —
-- it cannot, because 0002 forbids exactly that.
CREATE UNIQUE INDEX IF NOT EXISTS "buyback_runs_window_idx"
  ON "token"."buyback_runs" ("revenue_window_from", "revenue_window_to");

ALTER TABLE "token"."buyback_runs" DROP CONSTRAINT IF EXISTS "buyback_runs_status_ck";
ALTER TABLE "token"."buyback_runs" DROP COLUMN IF EXISTS "status";
