-- svc-trade · PX-S01 append-only lifecycle/correction evidence
-- Reversal: 0034_market_lifecycle_evidence.down.sql
--
-- This is evidence, not a second market state/book and never a money ledger.

CREATE TABLE IF NOT EXISTS "trade"."market_lifecycle_evidence" (
  "evidence_id"           text PRIMARY KEY,
  "market_id"             uuid REFERENCES "trade"."markets" ("id"),
  "evidence_kind"         text NOT NULL,
  "transition"            jsonb,
  "correction"            jsonb,
  "causal_predecessor_id" text NOT NULL,
  "reconciliation_key"    text,
  "observed_at"           timestamptz NOT NULL,
  "created_at"            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "market_lifecycle_evidence_kind_ck"
    CHECK ("evidence_kind" IN ('TRANSITION', 'CORRECTION')),
  CONSTRAINT "market_lifecycle_evidence_payload_ck"
    CHECK (("evidence_kind" = 'TRANSITION' AND "transition" IS NOT NULL AND "correction" IS NULL)
        OR ("evidence_kind" = 'CORRECTION' AND "transition" IS NULL AND "correction" IS NOT NULL)),
  CONSTRAINT "market_lifecycle_evidence_predecessor_ck"
    CHECK (length(trim("causal_predecessor_id")) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "market_lifecycle_evidence_reconciliation_idx"
  ON "trade"."market_lifecycle_evidence" ("reconciliation_key")
  WHERE "reconciliation_key" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "market_lifecycle_evidence_market_idx"
  ON "trade"."market_lifecycle_evidence" ("market_id", "observed_at");
