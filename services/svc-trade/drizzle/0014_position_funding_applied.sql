-- trade.futures · a funding period may move a position's margin exactly once
-- Reversal: 0014_position_funding_applied.down.sql
--
-- THE DEFECT
--
-- `runFundingTick` does three things in order:
--
--   postLegs(ledger, legs)        -- idempotent: the ledger dedupes on its key
--   margins.applyFundingNets(...) -- NOT idempotent: a bare decrement
--   periods.markSettled(periodId) -- the guard that stops the tick re-running
--
-- The guard is written LAST, so a restart between the decrement and the settle
-- leaves the period unsettled and the next tick re-runs the whole thing. The
-- ledger correctly refuses to move the money twice. The position row does not:
-- `margin_current` is decremented a second time for the same funding period.
--
-- What that costs the trader: their residual margin reads lower than the ledger
-- says they paid for, so the position liquidates earlier than it should and
-- releases less collateral than is owed at close. `GREATEST(margin_current - x,
-- 0)` clamps the error at zero rather than raising, so nothing throws and no
-- reconciliation notices.
--
-- The window is one database write wide. Funding ticks run forever and services
-- restart on every deploy, so it is a matter of time, not of chance.
--
-- THE FIX
--
-- Idempotency belongs on the key that identifies the work, and that key is
-- (position, funding period) — not the position alone. `postLegs` is a call to
-- another service, so widening a transaction around all three steps is not
-- available; making the middle step repeatable is.
--
-- This table is that key. The store claims and applies in ONE statement, so
-- there is no second crash window between claiming and moving.
--
-- It is also, for free, the per-position funding audit trail a Class M path
-- should have had: "which periods has this position actually paid" stops being
-- something you infer from a running total.

CREATE TABLE IF NOT EXISTS "trade"."position_funding_applied" (
  "position_id" uuid        NOT NULL REFERENCES "trade"."positions" ("id") ON DELETE CASCADE,
  "period_id"   text        NOT NULL,
  -- Signed: positive is margin paid out of this position, negative is funding
  -- received. Recorded rather than derived so the trail says what happened, not
  -- what today's code would compute from today's rate.
  "paid"        numeric(38, 18) NOT NULL,
  "applied_at"  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("position_id", "period_id")
);

-- "What has this period already touched", for an operator reconciling a tick.
CREATE INDEX IF NOT EXISTS "position_funding_applied_period_idx"
  ON "trade"."position_funding_applied" ("period_id");
