-- Reverse 0029_position_margin_adjust_seq.sql
ALTER TABLE "trade"."positions" DROP CONSTRAINT IF EXISTS "positions_margin_adjust_seq_ck";
ALTER TABLE "trade"."positions" DROP COLUMN IF EXISTS "margin_adjust_request";
ALTER TABLE "trade"."positions" DROP COLUMN IF EXISTS "margin_adjust_seq";
