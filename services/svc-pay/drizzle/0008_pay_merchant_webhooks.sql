-- OUTBOUND MERCHANT WEBHOOKS (pay.public-api step 3).
--
-- ADR docs/adr/2026-08-07-pay-public-api-law.md §2.4:
--   signed HMAC deliveries, at-least-once with event-id dedup, retry/backoff,
--   permanently failing endpoints disabled and surfaced on a dashboard.
-- Not money — only endpoint config + delivery journal. Value still moves only
-- through ledger-client recipes inside PayService.

CREATE TABLE IF NOT EXISTS "pay"."merchant_webhook_endpoints" (
  "id" uuid PRIMARY KEY,
  "merchant_id" uuid NOT NULL REFERENCES "pay"."merchants"("id"),
  "url" text NOT NULL,
  "secret_hash" text NOT NULL,
  "signing_secret" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "disabled_reason" text,
  "consecutive_failures" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "merchant_webhook_endpoints_merchant_idx"
  ON "pay"."merchant_webhook_endpoints" ("merchant_id");

CREATE TABLE IF NOT EXISTS "pay"."merchant_webhook_deliveries" (
  "id" uuid PRIMARY KEY,
  "endpoint_id" uuid NOT NULL REFERENCES "pay"."merchant_webhook_endpoints"("id"),
  "merchant_id" uuid NOT NULL REFERENCES "pay"."merchants"("id"),
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
  "last_status_code" integer,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "delivered_at" timestamptz,
  CONSTRAINT "merchant_webhook_deliveries_endpoint_event_uq" UNIQUE ("endpoint_id", "event_id")
);

CREATE INDEX IF NOT EXISTS "merchant_webhook_deliveries_due_idx"
  ON "pay"."merchant_webhook_deliveries" ("status", "next_attempt_at");

CREATE INDEX IF NOT EXISTS "merchant_webhook_deliveries_merchant_idx"
  ON "pay"."merchant_webhook_deliveries" ("merchant_id", "created_at");
