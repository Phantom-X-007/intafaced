-- svc-launch · initial schema (§8.4 — launchpad raises + vesting)
-- Reversal: 0000_launch_init.down.sql
--
-- The "launch" schema itself is created by the database bootstrap
-- (tooling/infra/postgres-init/01-service-schemas.sql), which also grants it to
-- the svc_launch role. Migrations run as that role and hold no database-level
-- CREATE privilege — so a migration physically cannot reach outside its own
-- schema (§2).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THERE IS NO BALANCE COLUMN IN THIS FILE.
--
-- Doctrine §0.6: no module holds its own balance. Every numeric column here is
-- a TERM of the raise, a RECORD of a movement that already posted, or a
-- watermark of how far a vesting schedule has been released. What is actually
-- escrowed lives in svc-ledger:
--
--     issuer supply   → escrow  user:<issuer> / <sale asset>  purpose launch:supply:<raise>
--     contributions   → escrow  user:<buyer>  / <pay asset>   purpose launch:raise:<raise>
--     vesting         → module  launch:vest:<schedule>
--
-- The test suite reads information_schema.columns and fails the build if a
-- column that looks like a balance ever appears below.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every statement is idempotent: this file is re-runnable, and CHECK
-- constraints are re-asserted with DROP ... IF EXISTS first so tightening one
-- later is an edit here rather than a new migration.

DO $$ BEGIN
  CREATE TYPE "launch"."raise_mode" AS ENUM ('presale', 'fair');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "launch"."raise_status" AS ENUM ('draft', 'funding', 'succeeded', 'failed', 'settled', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "launch"."contribution_status" AS ENUM ('committed', 'settled', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── raises ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "launch"."raises" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "issuer_id"         uuid NOT NULL,
  "slug"              text NOT NULL,
  "name"              text NOT NULL,
  "sale_asset_id"     text NOT NULL,
  "payment_asset_id"  text NOT NULL,
  "mode"              "launch"."raise_mode" NOT NULL,
  "status"            "launch"."raise_status" NOT NULL DEFAULT 'draft',
  "sale_supply"       numeric(38, 18) NOT NULL,
  "price"             numeric(38, 18),
  "soft_cap"          numeric(38, 18) NOT NULL,
  "hard_cap"          numeric(38, 18) NOT NULL,
  "fee_bps"           numeric(8, 0) NOT NULL DEFAULT 0,
  "opens_at"          timestamptz NOT NULL,
  "closes_at"         timestamptz NOT NULL,
  "vest_cliff_days"   integer,
  "vest_duration_days" integer,
  "outcome_at"        timestamptz,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "raises_slug_idx"   ON "launch"."raises" ("slug");
CREATE INDEX        IF NOT EXISTS "raises_issuer_idx" ON "launch"."raises" ("issuer_id");
CREATE INDEX        IF NOT EXISTS "raises_status_idx" ON "launch"."raises" ("status", "closes_at");

-- A raise priced in the asset it is selling is not a raise. The ledger recipe
-- refuses it too; asserting it here means the row can never exist to be read.
ALTER TABLE "launch"."raises" DROP CONSTRAINT IF EXISTS "raises_distinct_assets_ck";
ALTER TABLE "launch"."raises" ADD CONSTRAINT "raises_distinct_assets_ck"
  CHECK ("sale_asset_id" <> "payment_asset_id");

ALTER TABLE "launch"."raises" DROP CONSTRAINT IF EXISTS "raises_amounts_ck";
ALTER TABLE "launch"."raises" ADD CONSTRAINT "raises_amounts_ck"
  CHECK ("sale_supply" > 0 AND "soft_cap" >= 0 AND "hard_cap" > 0 AND "hard_cap" >= "soft_cap");

ALTER TABLE "launch"."raises" DROP CONSTRAINT IF EXISTS "raises_fee_ck";
ALTER TABLE "launch"."raises" ADD CONSTRAINT "raises_fee_ck"
  CHECK ("fee_bps" >= 0 AND "fee_bps" < 10000);

ALTER TABLE "launch"."raises" DROP CONSTRAINT IF EXISTS "raises_window_ck";
ALTER TABLE "launch"."raises" ADD CONSTRAINT "raises_window_ck"
  CHECK ("closes_at" > "opens_at");

-- A presale has a price; a fair launch does not have one until it closes.
-- Without this a "fair" raise could carry a stale price column that nothing
-- reads, which is how a UI ends up displaying a number the engine ignores.
ALTER TABLE "launch"."raises" DROP CONSTRAINT IF EXISTS "raises_price_mode_ck";
ALTER TABLE "launch"."raises" ADD CONSTRAINT "raises_price_mode_ck"
  CHECK (("mode" = 'presale' AND "price" IS NOT NULL AND "price" > 0)
      OR ("mode" = 'fair'    AND "price" IS NULL));

-- Vesting is both terms or neither. A cliff with no duration is a schedule
-- nothing can compute.
ALTER TABLE "launch"."raises" DROP CONSTRAINT IF EXISTS "raises_vesting_ck";
ALTER TABLE "launch"."raises" ADD CONSTRAINT "raises_vesting_ck"
  CHECK (("vest_cliff_days" IS NULL AND "vest_duration_days" IS NULL)
      OR ("vest_cliff_days" >= 0 AND "vest_duration_days" > 0 AND "vest_cliff_days" <= "vest_duration_days"));

-- ── raise_tiers ──────────────────────────────────────────────────────────────
-- Allocation gates by `token.stakeOf`. `min_stake` is a THRESHOLD, never a
-- balance: this service asks svc-token whether a user clears it and stores the
-- answer's consequence, not the stake.
CREATE TABLE IF NOT EXISTS "launch"."raise_tiers" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "raise_id"        uuid NOT NULL REFERENCES "launch"."raises"("id") ON DELETE CASCADE,
  "name"            text NOT NULL,
  "min_stake"       numeric(38, 18) NOT NULL,
  "allocation_cap"  numeric(38, 18) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "raise_tiers_name_idx" ON "launch"."raise_tiers" ("raise_id", "name");
CREATE INDEX        IF NOT EXISTS "raise_tiers_gate_idx" ON "launch"."raise_tiers" ("raise_id", "min_stake");

ALTER TABLE "launch"."raise_tiers" DROP CONSTRAINT IF EXISTS "raise_tiers_amounts_ck";
ALTER TABLE "launch"."raise_tiers" ADD CONSTRAINT "raise_tiers_amounts_ck"
  CHECK ("min_stake" >= 0 AND "allocation_cap" > 0);

-- ── contributions ────────────────────────────────────────────────────────────
-- ONE ROW PER (raise, contributor), matching the one escrow account per
-- (raise, contributor) in the ledger. `commit_seq` makes each top-up idempotent.
CREATE TABLE IF NOT EXISTS "launch"."contributions" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "raise_id"    uuid NOT NULL REFERENCES "launch"."raises"("id") ON DELETE CASCADE,
  "user_id"     uuid NOT NULL,
  "committed"   numeric(38, 18) NOT NULL,
  "commit_seq"  integer NOT NULL DEFAULT 0,
  "tier_name"   text,
  "status"      "launch"."contribution_status" NOT NULL DEFAULT 'committed',
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "contributions_pk"        ON "launch"."contributions" ("raise_id", "user_id");
CREATE INDEX        IF NOT EXISTS "contributions_raise_idx" ON "launch"."contributions" ("raise_id", "status");
CREATE INDEX        IF NOT EXISTS "contributions_user_idx"  ON "launch"."contributions" ("user_id");

ALTER TABLE "launch"."contributions" DROP CONSTRAINT IF EXISTS "contributions_amount_ck";
ALTER TABLE "launch"."contributions" ADD CONSTRAINT "contributions_amount_ck"
  CHECK ("committed" >= 0 AND "commit_seq" >= 0);

-- ── allocations ──────────────────────────────────────────────────────────────
-- Decided once at close, written BEFORE the ledger post that carries it out, so
-- the trail always explains the movement instead of being reconstructed from it.
CREATE TABLE IF NOT EXISTS "launch"."allocations" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "raise_id"     uuid NOT NULL REFERENCES "launch"."raises"("id") ON DELETE CASCADE,
  "user_id"      uuid NOT NULL,
  "contributed"  numeric(38, 18) NOT NULL,
  "refund"       numeric(38, 18) NOT NULL,
  "sale_amount"  numeric(38, 18) NOT NULL,
  "settled_at"   timestamptz,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "allocations_pk"           ON "launch"."allocations" ("raise_id", "user_id");
CREATE INDEX        IF NOT EXISTS "allocations_pending_idx"  ON "launch"."allocations" ("raise_id", "settled_at");

ALTER TABLE "launch"."allocations" DROP CONSTRAINT IF EXISTS "allocations_amounts_ck";
ALTER TABLE "launch"."allocations" ADD CONSTRAINT "allocations_amounts_ck"
  CHECK ("contributed" > 0 AND "refund" >= 0 AND "sale_amount" >= 0 AND "refund" <= "contributed");

-- ── vesting_schedules ────────────────────────────────────────────────────────
-- The tokens are in `module:launch:vest:<id>` in the ledger. `released` is a
-- watermark so a claim knows what it has already paid; `release_seq` is the
-- ledger key, incremented under the same row lock.
CREATE TABLE IF NOT EXISTS "launch"."vesting_schedules" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "raise_id"        uuid REFERENCES "launch"."raises"("id") ON DELETE SET NULL,
  "beneficiary_id"  uuid NOT NULL,
  "asset_id"        text NOT NULL,
  "total"           numeric(38, 18) NOT NULL,
  "released"        numeric(38, 18) NOT NULL DEFAULT 0,
  "release_seq"     integer NOT NULL DEFAULT 0,
  "cliff_at"        timestamptz NOT NULL,
  "start_at"        timestamptz NOT NULL,
  "end_at"          timestamptz NOT NULL,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "vesting_beneficiary_idx" ON "launch"."vesting_schedules" ("beneficiary_id");
CREATE INDEX IF NOT EXISTS "vesting_raise_idx"       ON "launch"."vesting_schedules" ("raise_id");

-- One schedule per (raise, beneficiary): a resumed settlement must not create a
-- second grant for someone it already granted. NULL raise_ids are distinct in
-- Postgres, which is what lets a beneficiary hold several standalone grants.
CREATE UNIQUE INDEX IF NOT EXISTS "vesting_raise_beneficiary_idx"
  ON "launch"."vesting_schedules" ("raise_id", "beneficiary_id");

-- THE INVARIANT THAT KEEPS A SCHEDULE HONEST. Over-releasing would be caught by
-- the ledger too (module accounts are hard non-negative), which is exactly why
-- there are two: the ledger refuses the movement, and this refuses the claim
-- that it happened.
ALTER TABLE "launch"."vesting_schedules" DROP CONSTRAINT IF EXISTS "vesting_released_ck";
ALTER TABLE "launch"."vesting_schedules" ADD CONSTRAINT "vesting_released_ck"
  CHECK ("total" > 0 AND "released" >= 0 AND "released" <= "total" AND "release_seq" >= 0);

ALTER TABLE "launch"."vesting_schedules" DROP CONSTRAINT IF EXISTS "vesting_window_ck";
ALTER TABLE "launch"."vesting_schedules" ADD CONSTRAINT "vesting_window_ck"
  CHECK ("end_at" > "start_at" AND "cliff_at" >= "start_at" AND "cliff_at" <= "end_at");
