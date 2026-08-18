-- svc-support · durable ticket desk (ops.support)
-- Reversal: 0000_support_init.down.sql
--
-- The "support" schema itself is created by the database bootstrap
-- (tooling/infra/postgres-init/01-service-schemas.sql), which also grants it to
-- the svc_support role. Migrations run as that role and hold no
-- database-level CREATE privilege — so a migration physically cannot reach
-- outside its own schema (§2).
--
-- This service holds no balances and posts no ledger transactions.
-- Operator claim exclusivity is an atomic UPDATE (see store.claimTicket), not
-- a read-then-write over two replicas' in-process Maps.

CREATE TABLE IF NOT EXISTS "support"."tickets" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      text NOT NULL,
  "category"     text NOT NULL,
  "subject"      text NOT NULL,
  "body"         text NOT NULL,
  "status"       text NOT NULL DEFAULT 'open',
  "assignee_id"  text,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "support"."tickets" DROP CONSTRAINT IF EXISTS "tickets_status_ck";
ALTER TABLE "support"."tickets" ADD CONSTRAINT "tickets_status_ck"
  CHECK ("status" IN ('open', 'pending', 'resolved', 'closed'));

ALTER TABLE "support"."tickets" DROP CONSTRAINT IF EXISTS "tickets_category_ck";
ALTER TABLE "support"."tickets" ADD CONSTRAINT "tickets_category_ck"
  CHECK ("category" IN ('account', 'trading', 'deposit_withdraw', 'other'));

CREATE INDEX IF NOT EXISTS "tickets_user_created_idx"
  ON "support"."tickets" ("user_id", "created_at" DESC);

-- Operator queue: open/pending, oldest-first within priority (app ranks; index helps scan).
CREATE INDEX IF NOT EXISTS "tickets_queue_idx"
  ON "support"."tickets" ("status", "created_at")
  WHERE "status" IN ('open', 'pending');

CREATE TABLE IF NOT EXISTS "support"."comments" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id"    uuid NOT NULL REFERENCES "support"."tickets" ("id") ON DELETE CASCADE,
  "author_id"    text NOT NULL,
  "author_role"  text NOT NULL,
  "body"         text NOT NULL,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "support"."comments" DROP CONSTRAINT IF EXISTS "comments_author_role_ck";
ALTER TABLE "support"."comments" ADD CONSTRAINT "comments_author_role_ck"
  CHECK ("author_role" IN ('user', 'operator'));

CREATE INDEX IF NOT EXISTS "comments_ticket_created_idx"
  ON "support"."comments" ("ticket_id", "created_at");
