-- Reversal of 0007_position_accepted_mark.sql.
--
-- Dropping these disarms the deviation breaker again — every position becomes a
-- "first valuation" forever. Reverse only to unwind the migration, never to
-- quiet a breaker refusal.

ALTER TABLE "trade"."positions" DROP CONSTRAINT IF EXISTS "positions_accepted_mark_positive_ck";
ALTER TABLE "trade"."positions" DROP COLUMN IF EXISTS "accepted_mark_at";
ALTER TABLE "trade"."positions" DROP COLUMN IF EXISTS "accepted_mark";
