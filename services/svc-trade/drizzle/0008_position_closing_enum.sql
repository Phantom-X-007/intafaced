-- trade.futures · voluntary exit when the feed is dark (enum half)
-- Reversal: 0008_position_closing_enum.down.sql
--
-- ADR: docs/adr/2026-08-07-futures-exit-when-the-feed-is-dark.md
--
-- ADD VALUE alone. Postgres refuses to USE a newly added enum label until the
-- transaction that added it commits — so the column + check live in 0009.

ALTER TYPE "trade"."position_status" ADD VALUE IF NOT EXISTS 'closing';
