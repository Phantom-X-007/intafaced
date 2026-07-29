-- svc-academy · initial schema (§8.3 — lobbies, curriculum, certifications)
-- Reversal: 0000_academy_init.down.sql
--
-- The "academy" schema itself is created by the database bootstrap
-- (tooling/infra/postgres-init/01-service-schemas.sql), which also grants it to
-- the svc_academy role. Migrations run as that role and hold no database-level
-- CREATE privilege — so a migration physically cannot reach outside its own
-- schema (§2).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- NO MONEY MOVES IN THIS SERVICE.
--
-- `academy` is `custodial: false` in the module registry. The one money-shaped
-- column below is `rooms.min_stake`, and it is a THRESHOLD compared against
-- `token.stakeOf` — svc-token owns the stake, and the answer is never stored
-- here. It is still numeric(38,18) because a threshold compared against a stake
-- has to be the same kind of number as the stake.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every statement is idempotent: this file is re-runnable, and CHECK
-- constraints are re-asserted with DROP ... IF EXISTS first so tightening one
-- later is an edit here rather than a new migration.

DO $$ BEGIN
  CREATE TYPE "academy"."room_kind" AS ENUM
    ('general', 'futures', 'options', 'meme_war_room', 'forex', 'defi_lab', 'merchant_clinic');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "academy"."room_access" AS ENUM ('free', 'staked', 'invite');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "academy"."session_status" AS ENUM ('scheduled', 'live', 'ended', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "academy"."attendee_role" AS ENUM ('host', 'speaker', 'attendee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "academy"."curriculum_item_kind" AS ENUM ('playbook', 'workbook', 'video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "academy"."enrollment_status" AS ENUM ('active', 'completed', 'abandoned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── rooms ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "academy"."rooms" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug"       text NOT NULL,
  "name"       text NOT NULL,
  "kind"       "academy"."room_kind" NOT NULL DEFAULT 'general',
  "access"     "academy"."room_access" NOT NULL DEFAULT 'free',
  "min_stake"  numeric(38, 18) NOT NULL DEFAULT 0,
  "capacity"   integer NOT NULL,
  "host_id"    uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "rooms_slug_idx" ON "academy"."rooms" ("slug");
CREATE INDEX        IF NOT EXISTS "rooms_kind_idx" ON "academy"."rooms" ("kind", "access");

ALTER TABLE "academy"."rooms" DROP CONSTRAINT IF EXISTS "rooms_capacity_ck";
ALTER TABLE "academy"."rooms" ADD CONSTRAINT "rooms_capacity_ck" CHECK ("capacity" > 0);

-- A `staked` room with no threshold is a free room that says otherwise, and a
-- threshold on a room that does not gate on stake is a number nothing reads.
-- Both are the sort of quiet inconsistency a UI renders confidently.
ALTER TABLE "academy"."rooms" DROP CONSTRAINT IF EXISTS "rooms_stake_gate_ck";
ALTER TABLE "academy"."rooms" ADD CONSTRAINT "rooms_stake_gate_ck"
  CHECK (("access" = 'staked' AND "min_stake" > 0) OR ("access" <> 'staked' AND "min_stake" = 0));

-- ── room_invites ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "academy"."room_invites" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id"     uuid NOT NULL REFERENCES "academy"."rooms"("id") ON DELETE CASCADE,
  "user_id"     uuid NOT NULL,
  "invited_by"  uuid NOT NULL,
  "expires_at"  timestamptz,
  "used_at"     timestamptz,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "room_invites_pk"       ON "academy"."room_invites" ("room_id", "user_id");
CREATE INDEX        IF NOT EXISTS "room_invites_user_idx" ON "academy"."room_invites" ("user_id");

-- ── sessions ─────────────────────────────────────────────────────────────────
-- `scene` is the serializable 2D spatial state (§8.3). jsonb precisely so the
-- VR renderer is a different client over the same rows, not a migration.
CREATE TABLE IF NOT EXISTS "academy"."sessions" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id"         uuid NOT NULL REFERENCES "academy"."rooms"("id") ON DELETE CASCADE,
  "title"           text NOT NULL,
  "host_id"         uuid NOT NULL,
  "status"          "academy"."session_status" NOT NULL DEFAULT 'scheduled',
  "starts_at"       timestamptz NOT NULL,
  "ends_at"         timestamptz,
  "stream_provider" text,
  "stream_room"     text,
  "scene"           jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sessions_room_idx"   ON "academy"."sessions" ("room_id", "starts_at");
CREATE INDEX IF NOT EXISTS "sessions_status_idx" ON "academy"."sessions" ("status", "starts_at");

ALTER TABLE "academy"."sessions" DROP CONSTRAINT IF EXISTS "sessions_window_ck";
ALTER TABLE "academy"."sessions" ADD CONSTRAINT "sessions_window_ck"
  CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");

-- ── session_attendees ────────────────────────────────────────────────────────
-- `left_at IS NULL` is presence. Occupancy is a COUNT(*), never a maintained
-- counter — a counter is the one thing in a service certain to drift.
CREATE TABLE IF NOT EXISTS "academy"."session_attendees" (
  "session_id"  uuid NOT NULL REFERENCES "academy"."sessions"("id") ON DELETE CASCADE,
  "user_id"     uuid NOT NULL,
  "role"        "academy"."attendee_role" NOT NULL DEFAULT 'attendee',
  "joined_at"   timestamptz NOT NULL DEFAULT now(),
  "left_at"     timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "session_attendees_pk"       ON "academy"."session_attendees" ("session_id", "user_id");
CREATE INDEX        IF NOT EXISTS "session_attendees_live_idx" ON "academy"."session_attendees" ("session_id", "left_at");

-- ── curricula ────────────────────────────────────────────────────────────────
-- `blueprint_path` is a plain string, deliberately: §2 forbids reading another
-- service's tables and §10 keeps profile content out of this schema entirely.
CREATE TABLE IF NOT EXISTS "academy"."curricula" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug"            text NOT NULL,
  "title"           text NOT NULL,
  "track"           text NOT NULL,
  "blueprint_path"  text,
  "published"       boolean NOT NULL DEFAULT false,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "curricula_slug_idx" ON "academy"."curricula" ("slug");
CREATE INDEX        IF NOT EXISTS "curricula_path_idx" ON "academy"."curricula" ("blueprint_path", "published");

-- ── curriculum_items ─────────────────────────────────────────────────────────
-- `position` is what makes a path a SEQUENCE rather than a bag.
CREATE TABLE IF NOT EXISTS "academy"."curriculum_items" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "curriculum_id"  uuid NOT NULL REFERENCES "academy"."curricula"("id") ON DELETE CASCADE,
  "position"       integer NOT NULL,
  "kind"           "academy"."curriculum_item_kind" NOT NULL,
  "slug"           text NOT NULL,
  "title"          text NOT NULL,
  "paper_trading"  boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_items_position_idx" ON "academy"."curriculum_items" ("curriculum_id", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_items_slug_idx"     ON "academy"."curriculum_items" ("curriculum_id", "slug");

ALTER TABLE "academy"."curriculum_items" DROP CONSTRAINT IF EXISTS "curriculum_items_position_ck";
ALTER TABLE "academy"."curriculum_items" ADD CONSTRAINT "curriculum_items_position_ck" CHECK ("position" >= 0);

-- ── enrollments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "academy"."enrollments" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "curriculum_id"  uuid NOT NULL REFERENCES "academy"."curricula"("id") ON DELETE CASCADE,
  "user_id"        uuid NOT NULL,
  "status"         "academy"."enrollment_status" NOT NULL DEFAULT 'active',
  "started_at"     timestamptz NOT NULL DEFAULT now(),
  "completed_at"   timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "enrollments_pk"       ON "academy"."enrollments" ("curriculum_id", "user_id");
CREATE INDEX        IF NOT EXISTS "enrollments_user_idx" ON "academy"."enrollments" ("user_id", "status");

-- ── item_progress ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "academy"."item_progress" (
  "enrollment_id"  uuid NOT NULL REFERENCES "academy"."enrollments"("id") ON DELETE CASCADE,
  "item_id"        uuid NOT NULL REFERENCES "academy"."curriculum_items"("id") ON DELETE CASCADE,
  "score"          integer,
  "completed_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "item_progress_pk" ON "academy"."item_progress" ("enrollment_id", "item_id");

-- Scores are basis points, so a reproducible score is never a float.
ALTER TABLE "academy"."item_progress" DROP CONSTRAINT IF EXISTS "item_progress_score_ck";
ALTER TABLE "academy"."item_progress" ADD CONSTRAINT "item_progress_score_ck"
  CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 10000));

-- ── certifications ───────────────────────────────────────────────────────────
-- The unique index is the reason XP cannot be awarded twice for one path: the
-- insert is the claim, and the event is published only when the insert wins.
CREATE TABLE IF NOT EXISTS "academy"."certifications" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"        uuid NOT NULL,
  "curriculum_id"  uuid NOT NULL REFERENCES "academy"."curricula"("id") ON DELETE CASCADE,
  "code"           text NOT NULL,
  "xp_awarded"     integer NOT NULL,
  "awarded_at"     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "certifications_pk"       ON "academy"."certifications" ("curriculum_id", "user_id");
CREATE INDEX        IF NOT EXISTS "certifications_user_idx" ON "academy"."certifications" ("user_id");

ALTER TABLE "academy"."certifications" DROP CONSTRAINT IF EXISTS "certifications_xp_ck";
ALTER TABLE "academy"."certifications" ADD CONSTRAINT "certifications_xp_ck" CHECK ("xp_awarded" >= 0);
