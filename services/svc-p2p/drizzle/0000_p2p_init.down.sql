-- intafaced:destructive — reversal of 0000_p2p_init.sql
--
-- This drops every P2P offer, trade, dispute and reputation record.
--
-- It exists so the migration is provably reversible in CI against a scratch
-- schema (§14 DoD 1). It must NEVER be run against a database with live trades:
-- svc-ledger still holds the escrowed value, but ONLY these tables record whose
-- escrow it is and which resolution was decided. Drop them and the ledger's
-- `escrow` accounts become a pile of value with no owner and no instruction —
-- the exact stranded-funds condition the whole service is built to prevent.
--
-- Before running this anywhere real, `p2p.p2p_trades` must contain no row with
-- `resolution IS NULL` and no row with `settled_at IS NULL AND resolved_at IS
-- NOT NULL`. That is: every escrow settled, nothing decided-but-unposted.
--
-- The "p2p" schema itself is left in place — the bootstrap owns it, not this
-- migration (§2), and this role has no DROP SCHEMA privilege anyway.

DROP TABLE IF EXISTS "p2p"."p2p_reputation";
DROP TABLE IF EXISTS "p2p"."p2p_disputes";
DROP TABLE IF EXISTS "p2p"."p2p_trades";
DROP TABLE IF EXISTS "p2p"."offers";

DROP TYPE IF EXISTS "p2p"."dispute_resolution";
DROP TYPE IF EXISTS "p2p"."dispute_status";
DROP TYPE IF EXISTS "p2p"."trade_resolution";
DROP TYPE IF EXISTS "p2p"."trade_status";
DROP TYPE IF EXISTS "p2p"."offer_status";
DROP TYPE IF EXISTS "p2p"."price_type";
DROP TYPE IF EXISTS "p2p"."offer_side";
