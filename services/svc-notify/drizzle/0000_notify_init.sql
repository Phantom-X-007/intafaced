-- svc-notify · initial schema (ops.notifications — in-app inbox only)
-- Reversal: 0000_notify_init.down.sql
--
-- The "notify" schema itself is created by the database bootstrap
-- (tooling/infra/postgres-init/01-service-schemas.sql), which also grants it to
-- the svc_notify role. Migrations run as that role and hold no
-- database-level CREATE privilege — so a migration physically cannot reach
-- outside its own schema (§2).
--
-- This service holds no balances and posts no ledger transactions. Rows are
-- inbox messages only — title/body are i18n keys, never vendor-rendered copy.
-- Push / email / SMS are §13 sockets; nothing here opens those channels.

CREATE TABLE IF NOT EXISTS "notify"."notifications" (
  "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"                 text NOT NULL,
  "kind"                    text NOT NULL,
  "title_key"               text NOT NULL,
  "body_key"                text NOT NULL,
  "params"                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  "href"                    text,
  "severity"                text NOT NULL DEFAULT 'info',
  "read_at"                 timestamptz,
  "source_subject"          text NOT NULL,
  "source_idempotency_key"  text NOT NULL,
  "created_at"              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "notify"."notifications" DROP CONSTRAINT IF EXISTS "notifications_severity_ck";
ALTER TABLE "notify"."notifications" ADD CONSTRAINT "notifications_severity_ck"
  CHECK ("severity" IN ('info', 'action', 'critical'));

-- At-least-once bus delivery must not double-write an inbox row for the same
-- business event. The natural key is (user, subject, producer idempotency key).
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_source_dedupe_idx"
  ON "notify"."notifications" ("user_id", "source_subject", "source_idempotency_key");

CREATE INDEX IF NOT EXISTS "notifications_user_created_idx"
  ON "notify"."notifications" ("user_id", "created_at" DESC);
