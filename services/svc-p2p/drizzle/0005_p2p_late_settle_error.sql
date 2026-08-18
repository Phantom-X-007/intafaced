-- svc-p2p · durable last settlement failure on late trades.
-- Reversal: 0005_p2p_late_settle_error.down.sql
--
-- NOT tagged `intafaced:destructive`: adds nullable columns only.
--
-- A trade with resolved_at set and settled_at null is a committed decision
-- whose ledger post (or announce) has not landed. Sweep failures used to live
-- only in process logs and the in-memory sweep return value — a restart lost
-- the reason. Operators need the last failure on the row so listLateSettlements
-- survives a process bounce (ADR 2026-08-04: surface permanent settlement fail).

ALTER TABLE p2p.p2p_trades
  ADD COLUMN IF NOT EXISTS "last_settle_error" text,
  ADD COLUMN IF NOT EXISTS "last_settle_error_at" timestamptz;
