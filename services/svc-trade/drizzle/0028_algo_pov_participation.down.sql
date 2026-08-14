-- Reverse 0028_algo_pov_participation.sql
ALTER TABLE "trade"."algo_parents" DROP COLUMN IF EXISTS "participation_bps";
ALTER TABLE "trade"."algo_parents" DROP COLUMN IF EXISTS "lot_size";
