-- Reverse 0015 — drop the durable pre-charge notify columns.

ALTER TABLE pay.subscription_executions
  DROP CONSTRAINT IF EXISTS subscription_executions_notify_status_named;

ALTER TABLE pay.subscription_executions
  DROP COLUMN IF EXISTS notified_at,
  DROP COLUMN IF EXISTS notify_code,
  DROP COLUMN IF EXISTS notify_status;
