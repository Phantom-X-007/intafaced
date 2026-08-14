ALTER TABLE "trade"."algo_parents" DROP CONSTRAINT IF EXISTS "algo_parents_participation_bps_ck";
ALTER TABLE "trade"."algo_parents" DROP COLUMN IF EXISTS "participation_bps";
ALTER TABLE "trade"."algo_parents" DROP COLUMN IF EXISTS "lot_size";
