-- Native amend (PX-S03 §8.2) needs the engine instruction version and a
-- cumulative proven qty-down release. hold_amount stays the original post;
-- remaining hold is hold_amount - Σ fills - amend_released.
ALTER TABLE "trade"."orders"
  ADD COLUMN IF NOT EXISTS "engine_version" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "amend_released" numeric(38, 18) NOT NULL DEFAULT 0;

ALTER TABLE "trade"."orders"
  DROP CONSTRAINT IF EXISTS "orders_engine_version_ck";
ALTER TABLE "trade"."orders"
  ADD CONSTRAINT "orders_engine_version_ck"
  CHECK ("engine_version" >= 1);

ALTER TABLE "trade"."orders"
  DROP CONSTRAINT IF EXISTS "orders_amend_released_ck";
ALTER TABLE "trade"."orders"
  ADD CONSTRAINT "orders_amend_released_ck"
  CHECK ("amend_released" >= 0 AND "amend_released" <= "hold_amount");
