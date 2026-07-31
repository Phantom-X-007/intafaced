-- DURABLE CRYPTO BROADCAST JOURNAL (Class M residual after live EVM rail).
--
-- MemoryBroadcastStore is single-process: a multi-replica fleet or a crash
-- after eth_sendRawTransaction but before remembering the hash can double-send.
-- This table is the shared claim→put journal. It does NOT hold balances — only
-- idempotency keys and outbound tx hashes.

CREATE TABLE IF NOT EXISTS "pay"."crypto_broadcasts" (
  "idempotency_key" text PRIMARY KEY NOT NULL,
  "tx_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "crypto_broadcasts_updated_idx"
  ON "pay"."crypto_broadcasts" ("updated_at");
