-- intafaced:destructive — reversal of 0000_notify_init.sql
--
-- Drops every in-app notification. Exists so the migration is provably
-- reversible in CI against a scratch schema (§14) — not for production use.
--
-- The "notify" schema itself is left in place — the bootstrap owns it, not
-- this migration (§2), and this role has no DROP SCHEMA privilege anyway.

DROP TABLE IF EXISTS "notify"."notifications";
