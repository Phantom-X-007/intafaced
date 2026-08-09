-- trade.algo · TWAP overdue re-space (ADR 2026-08-08)
-- Reversal: 0017_algo_twap_respace.down.sql
--
-- The interval is the promise. Slice due times live on next_due_at (re-spaced
-- from place/miss/resume/outage), not started_at + index * interval. Stretch
-- reason distinguishes user pause from tick outage. projected_ends_at is the
-- trader-visible end after re-space.

ALTER TABLE "trade"."algo_parents"
  ADD COLUMN IF NOT EXISTS "next_due_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "projected_ends_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "schedule_stretch_reason" text;

-- Backfill pre-migration rows so NOT NULL can apply. next_due_at uses the old
-- wall formula only as a starting point; the engine re-spaces on the next event.
UPDATE "trade"."algo_parents"
SET
  "next_due_at" = COALESCE(
    "next_due_at",
    "started_at" + (("next_slice_index" * "slice_interval_ms") * INTERVAL '1 millisecond')
  ),
  "projected_ends_at" = COALESCE(
    "projected_ends_at",
    "started_at" + ("duration_ms" * INTERVAL '1 millisecond')
  )
WHERE "next_due_at" IS NULL OR "projected_ends_at" IS NULL;

ALTER TABLE "trade"."algo_parents"
  ALTER COLUMN "next_due_at" SET NOT NULL,
  ALTER COLUMN "projected_ends_at" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "trade"."algo_parents"
    ADD CONSTRAINT "algo_parents_stretch_reason_ck"
    CHECK (
      "schedule_stretch_reason" IS NULL
      OR "schedule_stretch_reason" IN ('user_pause', 'tick_outage')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
