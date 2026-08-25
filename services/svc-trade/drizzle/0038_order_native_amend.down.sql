ALTER TABLE "trade"."orders" DROP CONSTRAINT IF EXISTS "orders_engine_version_ck";
ALTER TABLE "trade"."orders" DROP CONSTRAINT IF EXISTS "orders_amend_released_ck";
ALTER TABLE "trade"."orders"
  DROP COLUMN IF EXISTS "engine_version",
  DROP COLUMN IF EXISTS "amend_released";
