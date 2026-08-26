-- trade.otc · professional RFQ expire lifecycle (enum half)
-- Reversal: 0043_otc_quote_expired_enum.down.sql
--
-- ADD VALUE alone. Postgres refuses to USE a newly added enum label until the
-- transaction that added it commits — constraint lives in 0044.

ALTER TYPE "trade"."otc_quote_lifecycle" ADD VALUE IF NOT EXISTS 'expired';
