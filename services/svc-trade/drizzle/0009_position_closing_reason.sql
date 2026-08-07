-- trade.futures · voluntary exit when the feed is dark (column half)
-- Reversal: 0009_position_closing_reason.down.sql
--
-- Requires 0008 committed first so the `closing` enum label is usable.
-- `closing_reason` is the honesty field: a limbo position must not render as
-- a normal open. Futures-namespaced codes only (`trade.mark_missing` /
-- `trade.mark_unusable`).

ALTER TABLE "trade"."positions"
  ADD COLUMN IF NOT EXISTS "closing_reason" text;

DO $$ BEGIN
  ALTER TABLE "trade"."positions"
    ADD CONSTRAINT "positions_closing_reason_ck"
    CHECK (
      ("status" <> 'closing' AND "closing_reason" IS NULL)
      OR ("status" = 'closing' AND "closing_reason" IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
