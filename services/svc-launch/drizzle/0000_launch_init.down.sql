-- intafaced:destructive — reversal of 0000_launch_init.sql
--
-- It exists so the migration is provably reversible in CI against a scratch
-- schema (§14). It must NEVER be run against a database with live raises.
--
-- Note precisely what is and is not lost. No MONEY is here to lose: escrowed
-- supply, escrowed contributions and vested tokens all live in svc-ledger and
-- survive this file untouched. What dies is the meaning — which raise a pot of
-- escrow belongs to, what each contributor was promised, and how far a vesting
-- schedule had been released.
--
-- That last one is the dangerous part. Without `vesting_schedules.release_seq`
-- a re-created schedule would restart its ledger keys at 0 and a claim could
-- re-release a tranche that has already been paid. The ledger's idempotency
-- keys would still refuse the exact repeat, which is exactly why there are two
-- lines of defence — but the reconstructed watermark would be a guess.
--
-- The "launch" schema itself is left in place: the bootstrap owns it, not this
-- migration (§2), and this role has no DROP SCHEMA privilege anyway.

DROP TABLE IF EXISTS "launch"."vesting_schedules";
DROP TABLE IF EXISTS "launch"."allocations";
DROP TABLE IF EXISTS "launch"."contributions";
DROP TABLE IF EXISTS "launch"."raise_tiers";
DROP TABLE IF EXISTS "launch"."raises";

DROP TYPE IF EXISTS "launch"."contribution_status";
DROP TYPE IF EXISTS "launch"."raise_status";
DROP TYPE IF EXISTS "launch"."raise_mode";
