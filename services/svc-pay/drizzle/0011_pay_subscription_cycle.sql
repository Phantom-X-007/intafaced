-- SUBSCRIPTION CHARGE CYCLE — the schedule FRAME, arrears, and the business key.
--
-- 0010 built the durable shape: mandate, subscription, one execution row per
-- occurrence, `unique(subscription_id, occurrence)` as the double-fire guard.
-- This migration adds the four things the CYCLE needs and 0010 deliberately
-- left out, because each of them encodes a ruling rather than a table.
--
-- ── 1. THE SCHEDULE FRAME — `anchor_at` / `anchor_occurrence` ────────────────
--
-- 0010 derived every occurrence's due time from `mandate.starts_at`, fixed at
-- creation. That is the exact line `adr/2026-08-08-twap-overdue-slice-disposition.md`
-- ruled against for TWAP (`twap-engine.ts:226`): a schedule anchored at creation
-- COMPRESSES on resume. Measured there: "a 10-slice, one-per-minute TWAP paused
-- 20 minutes and resumed placed 9 slices in 8 seconds." The subscription version
-- of that is four months of charges landing in one pass, and it needs no user
-- action at all — the cron host being down for a while is enough.
--
-- So the frame moves. Occurrence `n` is due at
--   occurrenceStart(anchor_at, cadence, n - anchor_occurrence)
-- and a resume (or a detected runner outage) re-anchors to the resume instant.
-- Occurrence NUMBERING never restarts, which is what keeps the business
-- idempotency key stable across the re-anchor.
--
-- `anchor_at` is NULLable and means "the mandate's own `starts_at`". Rows that
-- pre-date this migration therefore keep exactly the behaviour they had, and no
-- backfill has to be trusted.
--
-- ── 2. ARREARS — `attempt_count` / `exhausted_at` / `stall_reason` ───────────
--
-- `adr/2026-08-05-futures-risk-and-mark-law.md` §Funding: "A period that cannot
-- be settled BLOCKS THE NEXT ONE rather than being silently skipped, because
-- compounding a gap changes what every subsequent position paid." 0010's
-- `MAX(occurrence)` over `('pending','settled','invoiced','rejected')` did the
-- opposite: a rejected charge advanced `lastFired`, so the next period fell due
-- and the failed one was never seen again.
--
-- The engine now blocks on an unsettled period, retries it under the SAME
-- business key up to a bound, and then STALLS the subscription with a reason
-- rather than rolling forward. `stall_reason` is what makes an operator pause,
-- a runner outage, arrears, and an unpublished fee four distinguishable facts
-- instead of one silent `paused`.
--
-- NO NEW ENUM VALUES, on purpose. `ALTER TYPE … ADD VALUE` has transaction
-- restrictions that vary by server version, and a migration that behaves
-- differently on the operator's Postgres than on ours is not a migration. A
-- stalled subscription is `paused` WITH a `stall_reason`; an exhausted cycle is
-- `rejected` WITH an `exhausted_at`.
--
-- ── 3. THE BUSINESS IDEMPOTENCY KEY — `idempotency_key` ─────────────────────
--
-- `pay.subscription:<subscriptionId>:<occurrence>`. Derived from the business
-- event — the PERIOD — and from nothing else. Not `randomUUID()`, not a clock
-- reading: `close:${positionId}` survived here and `close:${id}:${randomUUID()}`
-- drained a pot. It is stored, and UNIQUE, so "a retry charged twice" is a
-- constraint violation rather than a thing a reviewer has to notice.
--
-- Two guards, not one, because they fail differently:
--   `(subscription_id, occurrence)` — one row per period, whatever it is called.
--   `idempotency_key`              — one period per key, across the whole table.
-- A key built from a clock would satisfy the first and break the second.
--
-- ── 4. NO BALANCE HERE ──────────────────────────────────────────────────────
--
-- Doctrine §0.6 unchanged. Nothing in this migration holds value; the ledger
-- does. Amounts are `numeric(38,18)`, decimal on the wire, scaled bigint in
-- memory, and `amount > 0` is still a CHECK — which is precisely what makes a
-- failed cycle distinguishable from a zero-amount one: a zero-amount cycle
-- cannot be written at all.

-- ── SUBSCRIPTIONS — the frame and the stall ─────────────────────────────────

ALTER TABLE pay.subscriptions
  ADD COLUMN IF NOT EXISTS anchor_at timestamptz,
  ADD COLUMN IF NOT EXISTS anchor_occurrence integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS resumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stalled_at timestamptz,
  ADD COLUMN IF NOT EXISTS stall_reason text;

DO $$ BEGIN
  ALTER TABLE pay.subscriptions
    ADD CONSTRAINT subscriptions_anchor_occurrence_nonneg CHECK (anchor_occurrence >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A stall is a reason or nothing. An empty string is a stall nobody can explain.
DO $$ BEGIN
  ALTER TABLE pay.subscriptions
    ADD CONSTRAINT subscriptions_stall_reason_named CHECK (
      stall_reason IS NULL OR length(btrim(stall_reason)) > 0
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- `stalled_at` and `stall_reason` travel together, or a dashboard reports a
-- subscription as stalled since the epoch, or stalled for no reason.
DO $$ BEGIN
  ALTER TABLE pay.subscriptions
    ADD CONSTRAINT subscriptions_stall_is_complete CHECK (
      (stall_reason IS NULL) = (stalled_at IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS subscriptions_stalled_idx
  ON pay.subscriptions (stall_reason)
  WHERE stall_reason IS NOT NULL;

-- ── EXECUTIONS — attempts, exhaustion, and the key ─────────────────────────

ALTER TABLE pay.subscription_executions
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS exhausted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

DO $$ BEGIN
  ALTER TABLE pay.subscription_executions
    ADD CONSTRAINT subscription_executions_attempts_positive CHECK (attempt_count >= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A settled cycle is not an exhausted one. Both set at once would mean the
-- customer paid a charge the engine had already given up on.
DO $$ BEGIN
  ALTER TABLE pay.subscription_executions
    ADD CONSTRAINT subscription_executions_not_both_settled_and_exhausted CHECK (
      settled_at IS NULL OR exhausted_at IS NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- THE business-event guard. One period, one key, one row — table-wide.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_executions_idempotency_key_idx
  ON pay.subscription_executions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Retry sweeps read by (status, last_attempt_at); the status-only index cannot
-- serve that without reading every rejected row this deployment ever wrote.
CREATE INDEX IF NOT EXISTS subscription_executions_retry_idx
  ON pay.subscription_executions (status, last_attempt_at)
  WHERE exhausted_at IS NULL;
