-- Reverse 0017_algo_twap_respace.sql
ALTER TABLE "trade"."algo_parents" DROP CONSTRAINT IF EXISTS "algo_parents_stretch_reason_ck";
ALTER TABLE "trade"."algo_parents" DROP COLUMN IF EXISTS "schedule_stretch_reason";
ALTER TABLE "trade"."algo_parents" DROP COLUMN IF EXISTS "projected_ends_at";
ALTER TABLE "trade"."algo_parents" DROP COLUMN IF EXISTS "next_due_at";
