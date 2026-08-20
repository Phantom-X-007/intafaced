-- trade.futures · live re-leverage ledger sequence (isolated, ≤10×)
-- Reversal: 0029_position_margin_adjust_seq.down.sql
--
-- futuresMarginLock keys once per position (open). Extra lock uses
-- futuresMarginAdd; excess uses futuresMarginRelease. Close residual release
-- already uses sequence 1, so this counter starts at 1 and live adjusts post
-- at 2+. Never a JS number; integer sequence only.

ALTER TABLE "trade"."positions"
  ADD COLUMN IF NOT EXISTS "margin_adjust_seq" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "margin_adjust_request" text;

ALTER TABLE "trade"."positions"
  DROP CONSTRAINT IF EXISTS "positions_margin_adjust_seq_ck";
ALTER TABLE "trade"."positions"
  ADD CONSTRAINT "positions_margin_adjust_seq_ck" CHECK ("margin_adjust_seq" >= 1);
