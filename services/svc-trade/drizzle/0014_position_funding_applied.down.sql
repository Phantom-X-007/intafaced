-- Reverses 0014_position_funding_applied.sql
--
-- Dropping this table restores the old behaviour exactly: a funding tick that
-- is retried after a restart decrements `margin_current` a second time for the
-- same period, and the trader's position liquidates early and releases short.
-- Reversible does not mean harmless — this is the door, re-opened.
--
-- The audit trail goes with it. Nothing else references these rows, and the
-- positions they describe are untouched: no margin, no funding total and no
-- ledger entry is written or unwritten in either direction.

DROP INDEX IF EXISTS "trade"."position_funding_applied_period_idx";
DROP TABLE IF EXISTS "trade"."position_funding_applied";
