-- DURABLE INBOUND CHAIN-WATCHER CURSOR (Class M residual after live EVM rail).
--
-- CryptoChainWatcher used to remember last-emitted addresses only in process
-- memory. A crash re-drained the same finalization and POSTed the webhook
-- again. payment_events.rail_event_id still dedupes at the book; this table
-- is the watcher-side cursor so replay does not attempt a second credit.
-- Not money — only last-seen (block, tx hash, log index).

CREATE TABLE IF NOT EXISTS "pay"."chain_watcher_cursors" (
  "watcher_id" text PRIMARY KEY NOT NULL,
  "last_block" text NOT NULL,
  "last_tx_hash" text NOT NULL,
  "last_log_index" integer NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
