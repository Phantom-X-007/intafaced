-- Reverse 0046_order_fill_auth_attribution.sql

ALTER TABLE "trade"."fills"
  DROP COLUMN IF EXISTS "api_key_id",
  DROP COLUMN IF EXISTS "session_id";

ALTER TABLE "trade"."orders"
  DROP COLUMN IF EXISTS "api_key_id",
  DROP COLUMN IF EXISTS "session_id";
