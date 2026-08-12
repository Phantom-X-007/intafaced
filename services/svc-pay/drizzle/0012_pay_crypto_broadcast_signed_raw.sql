-- D26-P1-P9 / DIRECTION §3.1 — persist signed raw BEFORE eth_sendRawTransaction.
--
-- Migration 0004 closed multi-replica claim→put. Residual: crash after send and
-- before put left the hash unjournalled, so retry could sign+broadcast again.
-- Storing the signed bytes before broadcast lets crash-resume rebroadcast the
-- identical payload (same nonce / same hash) instead of a second spend.

ALTER TABLE "pay"."crypto_broadcasts"
  ADD COLUMN IF NOT EXISTS "signed_raw" text;
