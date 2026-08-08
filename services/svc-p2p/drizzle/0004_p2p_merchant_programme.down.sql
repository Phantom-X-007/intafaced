DROP TRIGGER IF EXISTS "p2p_merchant_events_append_only_trg" ON "p2p"."p2p_merchant_events";
DROP FUNCTION IF EXISTS "p2p"."p2p_merchant_events_append_only"();
DROP TABLE IF EXISTS "p2p"."p2p_merchant_events";
DROP TABLE IF EXISTS "p2p"."p2p_merchants";
DROP TYPE IF EXISTS "p2p"."merchant_status";
