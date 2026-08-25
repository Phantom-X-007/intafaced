-- trade.orders · GTD/GTT time-in-force (matching clock)
-- Reversal: 0039_gtd_gtt_tif.down.sql
--
-- ADD VALUE alone. Postgres refuses to USE a newly added enum label until the
-- transaction that added it commits.

ALTER TYPE "trade"."time_in_force" ADD VALUE IF NOT EXISTS 'GTD';
ALTER TYPE "trade"."time_in_force" ADD VALUE IF NOT EXISTS 'GTT';
