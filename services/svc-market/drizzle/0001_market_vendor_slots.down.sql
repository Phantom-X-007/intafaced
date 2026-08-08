-- Reverse 0001_market_vendor_slots.sql
--
-- The indexes go with the table. `market.vendors` is untouched by this
-- reversal — it belongs to 0000 and reversing Stage 2 must not take Stage 1's
-- vendor applications with it.
DROP INDEX IF EXISTS "market"."vendor_slots_open_idx";
DROP INDEX IF EXISTS "market"."vendor_slots_open_ref_idx";
DROP TABLE IF EXISTS "market"."vendor_slots";
