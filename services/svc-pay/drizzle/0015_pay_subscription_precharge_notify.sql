-- Durable pre-charge notify attempt on each subscription execution.
--
-- SPEC §4: every charge is notified before it lands. The due runner used to
-- open invoices with only an in-memory acknowledge of an unpublished socket.
-- These columns are the named row: attempted / skipped_unwired / failed.
-- skipped_unwired is NOT silent success — it is "we did not message the user".

ALTER TABLE pay.subscription_executions
  ADD COLUMN IF NOT EXISTS notify_status text;

ALTER TABLE pay.subscription_executions
  ADD COLUMN IF NOT EXISTS notify_code text;

ALTER TABLE pay.subscription_executions
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

ALTER TABLE pay.subscription_executions
  DROP CONSTRAINT IF EXISTS subscription_executions_notify_status_named;

ALTER TABLE pay.subscription_executions
  ADD CONSTRAINT subscription_executions_notify_status_named CHECK (
    notify_status IS NULL
    OR notify_status IN ('attempted', 'skipped_unwired', 'failed')
  );
