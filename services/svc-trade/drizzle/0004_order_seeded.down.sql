DROP INDEX IF EXISTS "trade"."orders_seeded_idx";
ALTER TABLE "trade"."orders" DROP COLUMN IF EXISTS "seeded";
