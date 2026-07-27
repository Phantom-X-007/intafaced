-- intafaced:destructive — reversal of 0000_pay_init.sql
--
-- This drops the entire payments core: every merchant, every payment, and the
-- append-only state history those payments would be argued from in a dispute.
-- It exists so the migration is provably reversible in CI against a scratch
-- schema (§14). It must NEVER be run against a database with live merchants:
-- the ledger still holds the value sitting in `pay:clearing:<merchantId>`, but
-- only these tables know which payments that value came from and which merchant
-- window it belongs to. That mapping is not recoverable from anywhere else.
--
-- The "pay" schema itself is left in place — the bootstrap owns it, not this
-- migration (§2), and this role has no DROP SCHEMA privilege anyway.

DROP TABLE IF EXISTS "pay"."settlements";
DROP TABLE IF EXISTS "pay"."payment_events";
DROP TABLE IF EXISTS "pay"."payments";
DROP TABLE IF EXISTS "pay"."payment_profiles";
DROP TABLE IF EXISTS "pay"."merchants";

DROP FUNCTION IF EXISTS "pay"."payment_events_append_only"();

DROP TYPE IF EXISTS "pay"."settlement_status";
DROP TYPE IF EXISTS "pay"."payment_status";
DROP TYPE IF EXISTS "pay"."merchant_status";
DROP TYPE IF EXISTS "pay"."kyb_status";
DROP TYPE IF EXISTS "pay"."merchant_mode";
