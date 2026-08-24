ALTER TABLE trade.orders
  ADD COLUMN IF NOT EXISTS lifecycle_proof jsonb;
