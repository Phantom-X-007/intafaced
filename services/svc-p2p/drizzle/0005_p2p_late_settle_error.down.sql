-- Reverse 0005_p2p_late_settle_error.sql
ALTER TABLE p2p.p2p_trades
  DROP COLUMN IF EXISTS "last_settle_error_at",
  DROP COLUMN IF EXISTS "last_settle_error";
