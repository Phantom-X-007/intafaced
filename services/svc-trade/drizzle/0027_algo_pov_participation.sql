-- trade.algo · POV participation bps (caller-published; never a product default)
-- Reversal: 0027_algo_pov_participation.down.sql

ALTER TABLE "trade"."algo_parents"
  ADD COLUMN IF NOT EXISTS "participation_bps" integer;

ALTER TABLE "trade"."algo_parents"
  ADD COLUMN IF NOT EXISTS "lot_size" numeric;

ALTER TABLE "trade"."algo_parents"
  DROP CONSTRAINT IF EXISTS "algo_parents_participation_bps_ck";

ALTER TABLE "trade"."algo_parents"
  ADD CONSTRAINT "algo_parents_participation_bps_ck"
  CHECK (
    ("kind" = 'pov' AND "participation_bps" IS NOT NULL AND "participation_bps" >= 1 AND "participation_bps" <= 10000 AND "lot_size" IS NOT NULL AND "lot_size" > 0)
    OR
    ("kind" <> 'pov' AND "participation_bps" IS NULL)
  );
