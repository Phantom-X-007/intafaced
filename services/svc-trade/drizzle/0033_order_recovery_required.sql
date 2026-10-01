-- Durable unknown execution outcome (PX-S03/PX-S06/PX-S12).
-- Reversal: 0033_order_recovery_required.down.sql
--
-- ADD VALUE alone. Postgres refuses to USE a newly added enum label until the
-- transaction that added it commits (55P04). Columns and the evidence
-- constraint live in 0047.

ALTER TYPE "trade"."order_status" ADD VALUE IF NOT EXISTS 'recovery_required';
