-- DURABLE MERCHANT-REST IDEMPOTENCY JOURNAL (pay.public-api step 2).
--
-- ADR docs/adr/2026-08-07-pay-public-api-law.md §2.2: every mutating POST
-- requires Idempotency-Key. A Memory store is single-process; multi-replica
-- needs a shared claim→put journal. This table is NOT money — only request
-- fingerprints and prior HTTP responses so a retry never double-charges.

CREATE TABLE IF NOT EXISTS "pay"."rest_idempotency" (
  "owner_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  -- 0 = pending (claim held, handler still running). Settled rows are 2xx/4xx.
  "status_code" integer NOT NULL DEFAULT 0,
  "response_body" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("owner_id", "idempotency_key")
);

CREATE INDEX IF NOT EXISTS "rest_idempotency_updated_idx"
  ON "pay"."rest_idempotency" ("updated_at");
