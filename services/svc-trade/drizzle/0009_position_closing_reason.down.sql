-- Reversal of 0009_position_closing_reason.sql
ALTER TABLE "trade"."positions" DROP CONSTRAINT IF EXISTS "positions_closing_reason_ck";
ALTER TABLE "trade"."positions" DROP COLUMN IF EXISTS "closing_reason";
