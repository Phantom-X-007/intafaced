-- Reverse 0011_pay_subscription_cycle.
--
-- Dropping `idempotency_key` drops the table-wide one-period-one-key guard, and
-- dropping `anchor_at` returns every schedule to a frame fixed at creation —
-- i.e. to the compressing behaviour the TWAP ADR ruled against. Both are
-- deliberate: a down migration restores 0010's shape exactly, and 0010's shape
-- is the one that had those defects.

DROP INDEX IF EXISTS pay.subscription_executions_retry_idx;
DROP INDEX IF EXISTS pay.subscription_executions_idempotency_key_idx;
DROP INDEX IF EXISTS pay.subscriptions_stalled_idx;

ALTER TABLE pay.subscription_executions
  DROP CONSTRAINT IF EXISTS subscription_executions_not_both_settled_and_exhausted,
  DROP CONSTRAINT IF EXISTS subscription_executions_attempts_positive,
  DROP COLUMN IF EXISTS idempotency_key,
  DROP COLUMN IF EXISTS last_attempt_at,
  DROP COLUMN IF EXISTS exhausted_at,
  DROP COLUMN IF EXISTS attempt_count;

ALTER TABLE pay.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_stall_is_complete,
  DROP CONSTRAINT IF EXISTS subscriptions_stall_reason_named,
  DROP CONSTRAINT IF EXISTS subscriptions_anchor_occurrence_nonneg,
  DROP COLUMN IF EXISTS stall_reason,
  DROP COLUMN IF EXISTS stalled_at,
  DROP COLUMN IF EXISTS resumed_at,
  DROP COLUMN IF EXISTS paused_at,
  DROP COLUMN IF EXISTS anchor_occurrence,
  DROP COLUMN IF EXISTS anchor_at;
