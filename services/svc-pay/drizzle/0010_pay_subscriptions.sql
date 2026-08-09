-- SUBSCRIPTIONS — mandate + schedule + execution journal (SPEC §4).
--
-- ── WHAT THIS IS ────────────────────────────────────────────────────────────
--
-- The SPEC done bar: "a mandate exists, a charge can be traced to it,
-- cancellation takes effect at once, and a price change without re-consent is
-- refused by the code, not by policy."
--
-- This migration is the durable shape only. No runner, no charge, no pull.
-- Crypto path when charged later is invoice-and-watch — protocol forbids
-- allowance/pull signatures. Card path may later use RailAdapter mandate ops.
--
-- ── NO BALANCE HERE ─────────────────────────────────────────────────────────
--
-- Doctrine §0.6: value lives in the ledger. Business key for a firing is
-- `pay.subscription:<subscriptionId>:<occurrence>` — reserved, not posted yet.
--
-- ── EXECUTIONS ARE TRUTH ────────────────────────────────────────────────────
--
-- Same law as bank.transfer_executions: unique(subscription_id, occurrence) is
-- the double-fire guard. lastFired is MAX(occurrence), never a counter column.

-- ── ENUMS ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE pay.subscription_cadence AS ENUM ('daily', 'weekly', 'monthly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pay.mandate_status AS ENUM ('active', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pay.subscription_status AS ENUM ('active', 'paused', 'cancelled', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pay.subscription_execution_status AS ENUM (
    'pending', 'settled', 'rejected', 'skipped', 'invoiced'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── MANDATE — the authorised object ─────────────────────────────────────────
--
-- amount = authorised charge amount (decimal string on wire; numeric here).
-- ceiling = optional hard cap (NULL = amount is the only bound).
-- Instruction is immutable after insert; price raise = new mandate + re-consent
-- (enforced in service code, not a trigger — same as bank schedule edits).

CREATE TABLE IF NOT EXISTS pay.subscription_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES pay.merchants (id),
  -- Customer principal (user id / account id). No balance here.
  customer_id text NOT NULL,
  asset_id text NOT NULL,
  amount numeric(38, 18) NOT NULL
    CONSTRAINT subscription_mandates_amount_positive CHECK (amount > 0),
  ceiling numeric(38, 18)
    CONSTRAINT subscription_mandates_ceiling_ok CHECK (ceiling IS NULL OR ceiling >= amount),
  cadence pay.subscription_cadence NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  -- Optional rail mandate reference when card mandate capability exists.
  rail_adapter text,
  rail_mandate_ref text,
  status pay.mandate_status NOT NULL DEFAULT 'active',
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_mandates_ends_after_starts CHECK (
    ends_at IS NULL OR ends_at > starts_at
  )
);

CREATE INDEX IF NOT EXISTS subscription_mandates_merchant_idx
  ON pay.subscription_mandates (merchant_id);

CREATE INDEX IF NOT EXISTS subscription_mandates_customer_idx
  ON pay.subscription_mandates (customer_id);

-- ── SUBSCRIPTION — schedule handle over a mandate ───────────────────────────

CREATE TABLE IF NOT EXISTS pay.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandate_id uuid NOT NULL REFERENCES pay.subscription_mandates (id),
  merchant_id uuid NOT NULL REFERENCES pay.merchants (id),
  customer_id text NOT NULL,
  -- Scheduling index only — truth of "did occurrence N fire" is executions.
  next_run_at timestamptz NOT NULL,
  status pay.subscription_status NOT NULL DEFAULT 'active',
  cancelled_at timestamptz,
  -- Path: 'card' | 'crypto_invoice' | future — text not enum so we do not guess.
  path text NOT NULL DEFAULT 'crypto_invoice'
    CONSTRAINT subscriptions_path_not_blank CHECK (length(btrim(path)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_due_idx
  ON pay.subscriptions (status, next_run_at);

CREATE INDEX IF NOT EXISTS subscriptions_merchant_idx
  ON pay.subscriptions (merchant_id);

CREATE INDEX IF NOT EXISTS subscriptions_mandate_idx
  ON pay.subscriptions (mandate_id);

-- ── EXECUTIONS — one row per occurrence ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS pay.subscription_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES pay.subscriptions (id),
  occurrence integer NOT NULL
    CONSTRAINT subscription_executions_occurrence_nonneg CHECK (occurrence >= 0),
  amount numeric(38, 18) NOT NULL
    CONSTRAINT subscription_executions_amount_positive CHECK (amount > 0),
  status pay.subscription_execution_status NOT NULL DEFAULT 'pending',
  -- Optional join to a payment/invoice created for this occurrence.
  payment_id uuid REFERENCES pay.payments (id),
  ledger_tx_id text,
  rejection_code text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- THE double-fire guard (same law as bank.transfer_executions).
CREATE UNIQUE INDEX IF NOT EXISTS subscription_executions_occurrence_idx
  ON pay.subscription_executions (subscription_id, occurrence);

CREATE INDEX IF NOT EXISTS subscription_executions_status_idx
  ON pay.subscription_executions (status);

CREATE INDEX IF NOT EXISTS subscription_executions_payment_idx
  ON pay.subscription_executions (payment_id)
  WHERE payment_id IS NOT NULL;
