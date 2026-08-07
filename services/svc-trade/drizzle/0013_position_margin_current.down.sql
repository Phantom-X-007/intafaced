-- Reversal of 0013_position_margin_current.sql

ALTER TABLE "trade"."positions" DROP CONSTRAINT IF EXISTS "positions_margin_current_ck";
ALTER TABLE "trade"."positions" DROP COLUMN IF EXISTS "margin_current";
