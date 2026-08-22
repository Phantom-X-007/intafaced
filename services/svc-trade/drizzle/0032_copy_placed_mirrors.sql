-- trade.copy · durable auto-mirror place claims
-- Reversal: 0032_copy_placed_mirrors.down.sql
--
-- SqlCopyFollowStore claims each (follow, leader fill) once before a follower
-- spot place can redeliver. clientOrderId is the exchange retry key; this row
-- is the process-crash once-key so runPlaceMirrorOnce cannot double-place.

CREATE TABLE IF NOT EXISTS "trade"."copy_placed_mirrors" (
  "follow_id"        text NOT NULL,
  "fill_id"          text NOT NULL,
  "order_id"         text NOT NULL,
  "client_order_id"  text NOT NULL,
  "price"            numeric(38, 18) NOT NULL,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("follow_id", "fill_id"),
  CONSTRAINT "copy_placed_mirrors_price_ck"
    CHECK ("price" > 0)
);

CREATE INDEX IF NOT EXISTS "copy_placed_mirrors_follow_idx"
  ON "trade"."copy_placed_mirrors" ("follow_id");
