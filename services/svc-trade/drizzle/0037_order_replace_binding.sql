-- Cancel/replace is a two-step saga, never an atomic exchange operation.
-- These nullable fields bind the replacement order to its original and to the
-- exact caller request so a retry can converge without a second hold.
ALTER TABLE "trade"."orders"
  ADD COLUMN IF NOT EXISTS "replacement_of" uuid,
  ADD COLUMN IF NOT EXISTS "replacement_request_hash" text;

ALTER TABLE "trade"."orders"
  DROP CONSTRAINT IF EXISTS "orders_replacement_hash_ck";
ALTER TABLE "trade"."orders"
  ADD CONSTRAINT "orders_replacement_hash_ck"
  CHECK (("replacement_of" IS NULL AND "replacement_request_hash" IS NULL)
      OR ("replacement_of" IS NOT NULL AND "replacement_request_hash" IS NOT NULL));

CREATE INDEX IF NOT EXISTS "orders_replacement_of_idx"
  ON "trade"."orders" ("replacement_of");

-- The request fence also records refusals, so a caller key cannot be reused
-- against another original after the first attempt safely ended with no order.
CREATE TABLE IF NOT EXISTS "trade"."order_replace_requests" (
  "user_id" uuid NOT NULL,
  "market_id" uuid NOT NULL,
  "client_order_id" text NOT NULL,
  "original_order_id" uuid NOT NULL,
  "request_hash" text NOT NULL,
  "replacement_order_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "market_id", "client_order_id")
);
CREATE INDEX IF NOT EXISTS "order_replace_requests_original_idx"
  ON "trade"."order_replace_requests" ("original_order_id");
