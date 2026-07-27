-- intafaced:destructive — reversal of 0000_trade_init.sql
--
-- This drops the entire spot trading record: every listing's terms, every order
-- ever placed, and every fill. It exists so the migration is provably
-- reversible in CI against a scratch schema (§14). It must NEVER be run against
-- a database with live orders in it.
--
-- Read that last sentence literally. The ledger holds the funds behind every
-- open order in `hold` accounts, keyed on `order.hold:<orderId>` — but ONLY
-- these tables know which order id that was, who placed it, and how much of it
-- has already been consumed by fills. Drop them and the money is still in the
-- book, still the users', and no longer attributable to anything. It is not
-- recoverable from svc-ledger, from svc-matching's journal, or from anywhere
-- else, because neither of those services knows what an asset or an order id
-- means in this schema.
--
-- The "trade" schema itself is left in place — the bootstrap owns it, not this
-- migration (§2), and this role has no DROP SCHEMA privilege anyway.

DROP TABLE IF EXISTS "trade"."fills";
DROP TABLE IF EXISTS "trade"."orders";
DROP TABLE IF EXISTS "trade"."markets";

DROP TYPE IF EXISTS "trade"."liquidity";
DROP TYPE IF EXISTS "trade"."order_status";
DROP TYPE IF EXISTS "trade"."time_in_force";
DROP TYPE IF EXISTS "trade"."order_type";
DROP TYPE IF EXISTS "trade"."order_side";
DROP TYPE IF EXISTS "trade"."market_status";
DROP TYPE IF EXISTS "trade"."market_kind";
