ALTER TABLE "trade"."orders" DROP CONSTRAINT IF EXISTS "orders_hold_non_negative_ck";
ALTER TABLE "trade"."orders" ADD CONSTRAINT "orders_hold_positive_ck"
  CHECK ("hold_amount" > 0);

ALTER TABLE "trade"."markets" DROP COLUMN IF EXISTS "paper";
