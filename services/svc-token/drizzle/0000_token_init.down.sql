-- intafaced:destructive — reversal of 0000_token_init.sql
--
-- This drops the entire native economy: every stake's terms, the emission
-- schedule, the buyback history and the governance record. It exists so the
-- migration is provably reversible in CI against a scratch schema (§14). It
-- must NEVER be run against a database with real stakes in it: the ledger holds
-- the staked principal but only these tables know the terms it was staked
-- under, and those terms are not recoverable from anywhere else.
--
-- The "token" schema itself is left in place — the bootstrap owns it, not this
-- migration (§2), and this role has no DROP SCHEMA privilege anyway.

DROP TABLE IF EXISTS "token"."governance_votes";
DROP TABLE IF EXISTS "token"."proposals";
DROP TABLE IF EXISTS "token"."buyback_runs";
DROP TABLE IF EXISTS "token"."emission_epochs";
DROP TABLE IF EXISTS "token"."stakes";
DROP TABLE IF EXISTS "token"."token_params";

DROP TYPE IF EXISTS "token"."vote_choice";
DROP TYPE IF EXISTS "token"."proposal_status";
DROP TYPE IF EXISTS "token"."proposal_kind";
DROP TYPE IF EXISTS "token"."stake_status";
DROP TYPE IF EXISTS "token"."stake_tier";
