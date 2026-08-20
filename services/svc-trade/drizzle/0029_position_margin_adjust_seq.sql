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

CREATE TABLE IF NOT EXISTS "trade"."position_margin_adjustments" (
  "position_id" uuid NOT NULL REFERENCES "trade"."positions"("id") ON DELETE CASCADE,
  "client_adjustment_id" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "sequence" integer NOT NULL CHECK ("sequence" >= 2),
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'completed')),
  "result" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  PRIMARY KEY ("position_id", "client_adjustment_id"),
  CHECK (("status" = 'pending' AND "result" IS NULL AND "completed_at" IS NULL)
      OR ("status" = 'completed' AND "result" IS NOT NULL AND "completed_at" IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "position_margin_adjustments_one_pending_idx"
  ON "trade"."position_margin_adjustments" ("position_id") WHERE "status" = 'pending';
