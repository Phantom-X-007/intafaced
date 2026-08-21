-- Drop 0 tease: email waitlist + referral queue (FIFO position, no rewards).
-- Distinct from identity.referral_edges (account affiliate tree).
-- Reversal: 0015_waitlist_referral_queue.down.sql

CREATE TABLE IF NOT EXISTS "identity"."waitlist_entries" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email"           citext NOT NULL,
  "referral_code"   text NOT NULL,
  "referred_by"     text,
  "position"        bigserial NOT NULL,
  "referred_count"  integer NOT NULL DEFAULT 0,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "waitlist_entries_code_ck"
    CHECK ("referral_code" ~ '^[a-f0-9]{12}$'),
  CONSTRAINT "waitlist_entries_referred_by_ck"
    CHECK ("referred_by" IS NULL OR "referred_by" ~ '^[a-f0-9]{12}$'),
  CONSTRAINT "waitlist_entries_no_self_ck"
    CHECK ("referred_by" IS NULL OR "referred_by" <> "referral_code"),
  CONSTRAINT "waitlist_entries_referred_count_ck"
    CHECK ("referred_count" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_entries_email_idx"
  ON "identity"."waitlist_entries" ("email");
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_entries_code_idx"
  ON "identity"."waitlist_entries" ("referral_code");
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_entries_position_idx"
  ON "identity"."waitlist_entries" ("position");
CREATE INDEX IF NOT EXISTS "waitlist_entries_referred_by_idx"
  ON "identity"."waitlist_entries" ("referred_by");

ALTER TABLE "identity"."waitlist_entries" DROP CONSTRAINT IF EXISTS "waitlist_entries_referred_by_fk";
ALTER TABLE "identity"."waitlist_entries"
  ADD CONSTRAINT "waitlist_entries_referred_by_fk"
  FOREIGN KEY ("referred_by") REFERENCES "identity"."waitlist_entries" ("referral_code");
