-- Reverse 0000_market_vendors.sql
--
-- The history table goes first: it holds the foreign key into vendors, and
-- dropping the parent while a child references it fails rather than cascading,
-- which is the safer direction for a reversal to get wrong.
DROP TRIGGER IF EXISTS "vendor_status_events_append_only_trg" ON "market"."vendor_status_events";
DROP TABLE IF EXISTS "market"."vendor_status_events";
DROP FUNCTION IF EXISTS "market"."vendor_status_events_append_only"();
DROP TABLE IF EXISTS "market"."vendors";
DROP TYPE IF EXISTS "market"."vendor_status";
