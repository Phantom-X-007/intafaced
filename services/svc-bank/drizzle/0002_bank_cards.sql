-- svc-bank · cards (§8.1 CardIssuerAdapter, §18 the sovereign card)
-- Reversal: 0002_bank_cards.down.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THERE IS NO BALANCE COLUMN IN THIS FILE EITHER.
--
-- Three numeric(38,18) columns arrive here. Each is one of the kinds
-- 0000_bank_init.sql already allows, and none of them accumulates:
--
--   · POLICY LIMIT  card_programmes.per_authorization_limit
--                   card_programmes.daily_limit
--                   card_programmes.monthly_limit
--                     — ceilings an ISSUER agreed to. Never written by a money
--                       path; changed only by an operator editing a programme.
--
--   · RECORD        card_authorizations.amount
--                     — what we approved, written once with the ledger hold.
--                   card_authorizations.captured_amount
--                     — what the scheme actually took, written once at capture.
--
-- "How much has this card spent today" is
--   SELECT sum(amount) FROM bank.card_authorizations
--    WHERE card_id = $1 AND status IN ('approved','captured') AND occurred_at >= $2
-- computed when it is asked. A `cards.spent_today` column would be a second
-- source of truth for money and would drift the first time a reversal posted
-- without decrementing it.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every statement is idempotent and re-runnable, matching 0000/0001.

DO $$ BEGIN
  CREATE TYPE "bank"."card_funding_source" AS ENUM ('ledger', 'self_custody');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "bank"."card_programme_status" AS ENUM ('draft', 'live', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "bank"."card_status" AS ENUM ('active', 'frozen', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "bank"."card_form" AS ENUM ('virtual', 'physical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "bank"."card_channel" AS ENUM ('pos', 'online', 'atm');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "bank"."card_authorization_status" AS ENUM ('approved', 'declined', 'captured', 'reversed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "bank"."card_programmes" (
  "id"                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code"                      text NOT NULL,
  "issuer_id"                 text NOT NULL,
  "programme_ref"             text NOT NULL,
  "region"                    text NOT NULL DEFAULT '*',
  "asset_id"                  text NOT NULL,
  "funding_source"            "bank"."card_funding_source" NOT NULL,
  "required_tier"             text NOT NULL,
  "per_authorization_limit"   numeric(38,18) NOT NULL,
  "daily_limit"               numeric(38,18) NOT NULL,
  "monthly_limit"             numeric(38,18) NOT NULL,
  "atm_enabled"               boolean NOT NULL DEFAULT false,
  "online_enabled"            boolean NOT NULL DEFAULT true,
  "cross_border_enabled"      boolean NOT NULL DEFAULT false,
  "cashback_bps"              numeric(8,0) NOT NULL DEFAULT 0,
  "status"                    "bank"."card_programme_status" NOT NULL DEFAULT 'draft',
  "reviewed_by"               text,
  "reviewed_at"               timestamptz,
  "created_at"                timestamptz NOT NULL DEFAULT now(),
  "updated_at"                timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "card_programmes_issuer_code_region_idx"
  ON "bank"."card_programmes" ("issuer_id", "code", "region");
CREATE INDEX IF NOT EXISTS "card_programmes_status_idx"
  ON "bank"."card_programmes" ("status", "region");

-- THE RULE, in the database as well as in policy.ts (§22).
--
-- A programme that asks for no verification while funding from a balance WE
-- hold is not a product, it is unlicensed money transmission wearing one.
-- `assertProgramme` refuses it in TypeScript; this refuses it in the one place
-- a psql session cannot argue with.
ALTER TABLE "bank"."card_programmes" DROP CONSTRAINT IF EXISTS "card_programmes_zero_tier_self_custody";
ALTER TABLE "bank"."card_programmes" ADD CONSTRAINT "card_programmes_zero_tier_self_custody"
  CHECK ("required_tier" <> 'none' OR "funding_source" = 'self_custody');

-- Same rule `assertReviewed()` puts on a launch market: a live card programme
-- encodes what an issuer's regulator permits, so it needs a name and a date.
ALTER TABLE "bank"."card_programmes" DROP CONSTRAINT IF EXISTS "card_programmes_live_reviewed";
ALTER TABLE "bank"."card_programmes" ADD CONSTRAINT "card_programmes_live_reviewed"
  CHECK ("status" <> 'live' OR ("reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL));

ALTER TABLE "bank"."card_programmes" DROP CONSTRAINT IF EXISTS "card_programmes_limits_ordered";
ALTER TABLE "bank"."card_programmes" ADD CONSTRAINT "card_programmes_limits_ordered"
  CHECK ("per_authorization_limit" > 0
     AND "per_authorization_limit" <= "daily_limit"
     AND "daily_limit" <= "monthly_limit");

ALTER TABLE "bank"."card_programmes" DROP CONSTRAINT IF EXISTS "card_programmes_tier_known";
ALTER TABLE "bank"."card_programmes" ADD CONSTRAINT "card_programmes_tier_known"
  CHECK ("required_tier" IN ('none', 'basic', 'full', 'institutional'));

ALTER TABLE "bank"."card_programmes" DROP CONSTRAINT IF EXISTS "card_programmes_cashback_range";
ALTER TABLE "bank"."card_programmes" ADD CONSTRAINT "card_programmes_cashback_range"
  CHECK ("cashback_bps" >= 0 AND "cashback_bps" < 10000);

CREATE TABLE IF NOT EXISTS "bank"."cards" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"               text NOT NULL,
  "programme_id"          uuid NOT NULL REFERENCES "bank"."card_programmes"("id"),
  "asset_id"              text NOT NULL,
  "form"                  "bank"."card_form" NOT NULL DEFAULT 'virtual',
  "issuer_card_ref"       text NOT NULL,
  "last_four"             text,
  "status"                "bank"."card_status" NOT NULL DEFAULT 'active',
  "funding_account_ref"   text,
  "atm_enabled"           boolean NOT NULL DEFAULT false,
  "online_enabled"        boolean NOT NULL DEFAULT true,
  "cross_border_enabled"  boolean NOT NULL DEFAULT false,
  "frozen_at"             timestamptz,
  "closed_at"             timestamptz,
  "created_at"            timestamptz NOT NULL DEFAULT now(),
  "updated_at"            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cards_user_idx" ON "bank"."cards" ("user_id", "status");
-- The webhook's lookup: an issuer names a card by THEIR reference, and two of
-- our cards answering to one of theirs would route a stranger's spend.
CREATE UNIQUE INDEX IF NOT EXISTS "cards_issuer_ref_idx" ON "bank"."cards" ("issuer_card_ref");

-- `last_four` is display data. No column here can hold a PAN, a CVV or an
-- expiry, which is what keeps this service out of PCI scope.
ALTER TABLE "bank"."cards" DROP CONSTRAINT IF EXISTS "cards_last_four_shape";
ALTER TABLE "bank"."cards" ADD CONSTRAINT "cards_last_four_shape"
  CHECK ("last_four" IS NULL OR "last_four" ~ '^[0-9]{4}$');

CREATE TABLE IF NOT EXISTS "bank"."card_authorizations" (
  "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "card_id"                 uuid NOT NULL REFERENCES "bank"."cards"("id"),
  "user_id"                 text NOT NULL,
  "asset_id"                text NOT NULL,
  "issuer_auth_ref"         text NOT NULL,
  "amount"                  numeric(38,18) NOT NULL,
  "captured_amount"         numeric(38,18),
  "channel"                 "bank"."card_channel" NOT NULL,
  "cross_border"            boolean NOT NULL DEFAULT false,
  "merchant_name"           text,
  "merchant_category_code"  text,
  "status"                  "bank"."card_authorization_status" NOT NULL,
  "decision_code"           text NOT NULL,
  "hold_ledger_tx_id"       text,
  "capture_ledger_tx_id"    text,
  "occurred_at"             timestamptz NOT NULL DEFAULT now(),
  "settled_at"              timestamptz,
  "created_at"              timestamptz NOT NULL DEFAULT now()
);

-- THE DOUBLE-AUTHORISE GUARD. A scheme redelivers and an issuer retries; one
-- authorisation reference is one authorisation and therefore one ledger hold,
-- whatever arrives twice. The recipe's idempotency key is the second line of
-- defence; this is the first.
CREATE UNIQUE INDEX IF NOT EXISTS "card_authorizations_issuer_ref_idx"
  ON "bank"."card_authorizations" ("issuer_auth_ref");

-- The window query: this card's approved spend since a given instant.
CREATE INDEX IF NOT EXISTS "card_authorizations_card_window_idx"
  ON "bank"."card_authorizations" ("card_id", "status", "occurred_at");

ALTER TABLE "bank"."card_authorizations" DROP CONSTRAINT IF EXISTS "card_authorizations_amount_positive";
ALTER TABLE "bank"."card_authorizations" ADD CONSTRAINT "card_authorizations_amount_positive"
  CHECK ("amount" > 0);

-- A capture can be smaller than the authorisation (a bar tab, a part shipment).
-- It can never be larger: that is money the user never agreed to and we never
-- reserved.
ALTER TABLE "bank"."card_authorizations" DROP CONSTRAINT IF EXISTS "card_authorizations_capture_within_auth";
ALTER TABLE "bank"."card_authorizations" ADD CONSTRAINT "card_authorizations_capture_within_auth"
  CHECK ("captured_amount" IS NULL OR ("captured_amount" >= 0 AND "captured_amount" <= "amount"));
