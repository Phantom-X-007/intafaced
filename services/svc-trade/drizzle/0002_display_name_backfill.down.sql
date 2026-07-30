-- intafaced:destructive — reversal of 0002_display_name_backfill.sql
--
-- Drops only the CHECK re-asserted by 0002. Does NOT blank display_name rows
-- the backfill filled — that would re-create the fleet-down failure mode #167
-- fixed, and a symbol-derived label is still a valid display name.
--
-- 0001's down remains the place that removes the column entirely.

ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_display_name_present_ck";
