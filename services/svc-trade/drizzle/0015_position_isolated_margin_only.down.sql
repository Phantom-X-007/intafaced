-- Reverses 0015. Dropping this constraint re-opens the cross-margin storage
-- gap: the enum still carries 'cross', and after this runs a direct INSERT can
-- create a cross-margin position again. Only `open()`'s service-layer refusal
-- would remain, which is what the migration exists to stop relying on.
--
-- Non-destructive: no data is read or written, so it is safe to re-apply 0015
-- afterwards provided no cross-margin row was created in between. If one was,
-- 0015's guard will refuse and name the count.
ALTER TABLE "trade"."positions"
  DROP CONSTRAINT IF EXISTS "ck_positions_isolated_margin_only";
