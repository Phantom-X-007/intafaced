-- intafaced:destructive — reversal of 0000_identity_init.sql
--
-- Drops every account, session, and rank in the system. Exists so CI can prove
-- the migration is reversible against a scratch schema (§14). Never run against
-- a database with real users: rank_state and xp_events are not recoverable from
-- anywhere else, and the ledger keys balances to these user ids.

DROP TABLE IF EXISTS "identity"."sub_accounts";
DROP TABLE IF EXISTS "identity"."api_keys";
DROP TABLE IF EXISTS "identity"."sessions";
DROP TABLE IF EXISTS "identity"."rank_thresholds";
DROP TABLE IF EXISTS "identity"."xp_events";
DROP TABLE IF EXISTS "identity"."rank_state";
DROP TABLE IF EXISTS "identity"."kyc_records";
DROP TABLE IF EXISTS "identity"."profiles";
DROP TABLE IF EXISTS "identity"."users";

DROP TYPE IF EXISTS "identity"."kyc_status";
DROP TYPE IF EXISTS "identity"."kyc_tier";
DROP TYPE IF EXISTS "identity"."user_status";
