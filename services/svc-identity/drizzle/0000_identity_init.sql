-- svc-identity · initial schema (§4.1 IDENTITY)
-- Reversal: 0000_identity_init.down.sql
--
-- The "identity" schema is created by the database bootstrap
-- (tooling/infra/postgres-init/01-service-schemas.sql). Migrations run as
-- svc_identity, which owns it and holds no database-level CREATE.

DO $$ BEGIN
  CREATE TYPE "identity"."user_status" AS ENUM ('active', 'frozen', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "identity"."kyc_tier" AS ENUM ('none', 'basic', 'full', 'institutional');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "identity"."kyc_status" AS ENUM ('pending', 'approved', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "identity"."users" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "handle"           citext NOT NULL,
  "email"            citext NOT NULL,
  "password_hash"    text NOT NULL,
  "totp_secret"      text,
  "totp_enrolled_at" timestamptz,
  "webauthn_creds"   jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status"           "identity"."user_status" NOT NULL DEFAULT 'active',
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);

-- citext, so Handle and handle are the same account. Impersonation by casing is
-- a real attack, not a curiosity.
CREATE UNIQUE INDEX IF NOT EXISTS "users_handle_idx" ON "identity"."users" ("handle");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx"  ON "identity"."users" ("email");

ALTER TABLE "identity"."users" DROP CONSTRAINT IF EXISTS "users_handle_shape_ck";
ALTER TABLE "identity"."users" ADD CONSTRAINT "users_handle_shape_ck"
  CHECK ("handle" ~ '^[a-zA-Z0-9_]{3,32}$');

CREATE TABLE IF NOT EXISTS "identity"."profiles" (
  "user_id"      uuid PRIMARY KEY REFERENCES "identity"."users"("id") ON DELETE CASCADE,
  "display_name" text,
  "avatar_url"   text,
  "modes"        text[] NOT NULL DEFAULT '{}',
  "locale"       text NOT NULL DEFAULT 'en',
  "region"       text,
  "blueprint_id" uuid,
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "identity"."kyc_records" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      uuid NOT NULL REFERENCES "identity"."users"("id") ON DELETE CASCADE,
  "tier"         "identity"."kyc_tier" NOT NULL,
  -- A pointer to the verification provider. Never a document, name, or DOB
  -- (§10 PII isolation).
  "provider_ref" text,
  "jurisdiction" text NOT NULL,
  "status"       "identity"."kyc_status" NOT NULL DEFAULT 'pending',
  "reviewed_at"  timestamptz,
  "expires_at"   timestamptz,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "kyc_user_idx" ON "identity"."kyc_records" ("user_id", "status");

CREATE TABLE IF NOT EXISTS "identity"."rank_state" (
  "user_id"    uuid PRIMARY KEY REFERENCES "identity"."users"("id") ON DELETE CASCADE,
  "rank"       integer NOT NULL DEFAULT 0,
  "xp"         bigint NOT NULL DEFAULT 0,
  "season_xp"  bigint NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Lifetime XP can be corrected downward but never below zero: a negative
-- lifetime total is meaningless and would break the ladder walk.
ALTER TABLE "identity"."rank_state" DROP CONSTRAINT IF EXISTS "rank_state_xp_non_negative_ck";
ALTER TABLE "identity"."rank_state" ADD CONSTRAINT "rank_state_xp_non_negative_ck"
  CHECK ("xp" >= 0 AND "season_xp" >= 0);

CREATE TABLE IF NOT EXISTS "identity"."xp_events" (
  "id"              bigserial PRIMARY KEY,
  "user_id"         uuid NOT NULL REFERENCES "identity"."users"("id") ON DELETE CASCADE,
  "source_module"   text NOT NULL,
  "action"          text NOT NULL,
  "xp_delta"        bigint NOT NULL,
  "meta"            jsonb NOT NULL DEFAULT '{}'::jsonb,
  "idempotency_key" text NOT NULL,
  "created_at"      timestamptz NOT NULL DEFAULT now()
);

-- The dedupe. An award is a fact that happened once; replaying the event must
-- not pay it twice (§10 consumers idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS "xp_events_idempotency_idx" ON "identity"."xp_events" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "xp_events_user_idx" ON "identity"."xp_events" ("user_id", "id");

CREATE TABLE IF NOT EXISTS "identity"."rank_thresholds" (
  "rank"        integer PRIMARY KEY,
  "xp_required" bigint NOT NULL,
  "title"       text NOT NULL,
  "perks"       jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "identity"."sessions" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"           uuid NOT NULL REFERENCES "identity"."users"("id") ON DELETE CASCADE,
  -- SHA-256 of the opaque token. The token itself is never stored, so a
  -- database read never yields a usable credential.
  "refresh_hash"      text NOT NULL,
  "device"            text,
  "ip"                text,
  "mfa"               boolean NOT NULL DEFAULT false,
  "expires_at"        timestamptz NOT NULL,
  "revoked"           boolean NOT NULL DEFAULT false,
  "reuse_detected_at" timestamptz,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "last_used_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "sessions_refresh_idx" ON "identity"."sessions" ("refresh_hash");
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "identity"."sessions" ("user_id", "revoked");

CREATE TABLE IF NOT EXISTS "identity"."api_keys" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"          uuid NOT NULL REFERENCES "identity"."users"("id") ON DELETE CASCADE,
  "name"             text NOT NULL,
  "key_hash"         text NOT NULL,
  "key_prefix"       text NOT NULL,
  "scopes"           text[] NOT NULL,
  "domain_whitelist" text[] NOT NULL DEFAULT '{}',
  "last_used_at"     timestamptz,
  "expires_at"       timestamptz,
  "revoked"          boolean NOT NULL DEFAULT false,
  "created_at"       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_hash_idx" ON "identity"."api_keys" ("key_hash");
CREATE INDEX IF NOT EXISTS "api_keys_user_idx" ON "identity"."api_keys" ("user_id", "revoked");

-- A long-lived key must never carry a scope that can move value off the
-- platform. The service checks this too; the database is the backstop (§9).
ALTER TABLE "identity"."api_keys" DROP CONSTRAINT IF EXISTS "api_keys_no_withdraw_ck";
ALTER TABLE "identity"."api_keys" ADD CONSTRAINT "api_keys_no_withdraw_ck"
  CHECK (NOT ("scopes" && ARRAY['trade:withdraw', 'admin:treasury', 'bank:card']));

CREATE TABLE IF NOT EXISTS "identity"."sub_accounts" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "parent_user_id" uuid NOT NULL REFERENCES "identity"."users"("id") ON DELETE CASCADE,
  "label"          text NOT NULL,
  "purpose"        text,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sub_accounts_parent_idx" ON "identity"."sub_accounts" ("parent_user_id");
