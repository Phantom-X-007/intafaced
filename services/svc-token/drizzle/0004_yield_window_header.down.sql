-- intafaced:destructive drops "token"."yield_windows", which is the record of
-- which revenue windows were claimed (including empty settlements). The money
-- itself lives in the ledger; only the freeze of (window_id, total) is lost.
-- After a drop, a re-run of a previously empty window could again plan late
-- joiners against already-swept revenue — the residual this migration closed.

ALTER TABLE "token"."yield_windows" DROP CONSTRAINT IF EXISTS "yield_windows_total_positive_ck";
DROP TABLE IF EXISTS "token"."yield_windows";
