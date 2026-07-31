-- Seed / mm honesty (order-route Spec SD-2 · Plan P4-2).
-- Marks orders placed by the seed/mm path so public volume can exclude them.
-- Reversal: 0004_order_seeded.down.sql

ALTER TABLE "trade"."orders"
  ADD COLUMN IF NOT EXISTS "seeded" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "orders_seeded_idx"
  ON "trade"."orders" ("seeded")
  WHERE "seeded" = true;

COMMENT ON COLUMN "trade"."orders"."seeded" IS
  'true = seed/mm liquidity order; excluded from public 24h / real-activity volume (SD-3)';
