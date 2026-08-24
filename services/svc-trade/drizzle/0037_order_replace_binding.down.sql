DROP INDEX IF EXISTS "trade"."orders_replacement_of_idx";
DROP TABLE IF EXISTS "trade"."order_replace_requests";
ALTER TABLE "trade"."orders" DROP CONSTRAINT IF EXISTS "orders_replacement_hash_ck";
ALTER TABLE "trade"."orders"
  DROP COLUMN IF EXISTS "replacement_of",
  DROP COLUMN IF EXISTS "replacement_request_hash";
