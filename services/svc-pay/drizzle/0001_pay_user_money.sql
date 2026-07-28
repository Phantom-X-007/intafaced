-- USER MONEY IN AND OUT (§4.2 deposit / withdraw).
--
-- Everything in 0000 is MERCHANT money: a third party pays a merchant, svc-pay
-- clears and settles it. These two tables are the other half — a USER's own
-- balance entering and leaving the book.
--
-- Before this migration there was no production path that credited a user's
-- `available` balance at all (`recipes.deposit` was called from tests only), so
-- `orderHold` could only ever fail with insufficient funds, and there was no
-- user withdrawal anywhere in the OS. The platform could not be used end to end.
--
-- NEITHER TABLE HOLDS A BALANCE. Both hold a record of an intent and where it
-- got to. The value is in the ledger and always was (Doctrine §0.6).

DO $$ BEGIN
  CREATE TYPE "pay"."deposit_status" AS ENUM ('pending', 'credited');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "pay"."withdrawal_status" AS ENUM ('pending', 'held', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── deposits ─────────────────────────────────────────────────────────────────
-- Value entering the book from a rail, credited by an OPERATOR. Never by the
-- beneficiary: a user who can call the thing that credits their own balance
-- does not need to deposit.

CREATE TABLE IF NOT EXISTS "pay"."deposits" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"     text NOT NULL,
  "asset_id"    text NOT NULL,
  "amount"      numeric(38, 18) NOT NULL,
  "rail"        text NOT NULL,
  "rail_ref"    text NOT NULL,
  -- WHO asserted the value arrived. The only record of it, and the reason this
  -- endpoint is operator-credentialed rather than a job with no name on it.
  "credited_by" text NOT NULL,
  "status"      "pay"."deposit_status" NOT NULL DEFAULT 'pending',
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);

-- THE IDEMPOTENCY, and the reason it is here rather than in application code.
--
-- `deposit` is keyed on (rail, railRef) in the ledger recipe
-- (`deposit:<rail>:<railRef>`). This index is the same key, enforced by the
-- database, so svc-pay and the ledger cannot come to different conclusions about
-- what "already credited" means. A webhook redelivery, a double-click, and a
-- retried job all land on this one row.
CREATE UNIQUE INDEX IF NOT EXISTS "deposits_rail_ref_idx" ON "pay"."deposits" ("rail", "rail_ref");
CREATE INDEX IF NOT EXISTS "deposits_user_idx" ON "pay"."deposits" ("user_id", "created_at");
-- The resume sweep: everything a rail took but the book has not booked yet.
CREATE INDEX IF NOT EXISTS "deposits_status_idx" ON "pay"."deposits" ("status");

-- A deposit of zero is a job that ran on nothing and recorded a credit anyway.
-- A negative one is a withdrawal wearing the wrong name, and would credit the
-- rail boundary out of a user's balance with none of a withdrawal's controls.
ALTER TABLE "pay"."deposits" DROP CONSTRAINT IF EXISTS "deposits_amount_positive_ck";
ALTER TABLE "pay"."deposits" ADD CONSTRAINT "deposits_amount_positive_ck"
  CHECK ("amount" > 0);

-- ── withdrawals ──────────────────────────────────────────────────────────────
-- A user's own balance leaving the book, through a rail.

CREATE TABLE IF NOT EXISTS "pay"."withdrawals" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      text NOT NULL,
  "asset_id"     text NOT NULL,
  "amount"       numeric(38, 18) NOT NULL,
  "rail"         text NOT NULL,
  "destination"  jsonb NOT NULL,
  -- The caller's own key. What makes a retry a RESUME rather than a second
  -- withdrawal — which, on this path, would be a second debit.
  "client_ref"   text NOT NULL,
  "rail_ref"     text,
  -- Rail REFUSALS so far. Part of the hold's ledger idempotency key: a refusal
  -- reverses the hold, so the next attempt needs a fresh key, while a
  -- crash-and-resume reuses its key and stays idempotent. Same mechanism as
  -- `settlements.payout_attempts`, for the same reason.
  "attempts"     integer NOT NULL DEFAULT 0,
  "failure_code" text,
  "status"       "pay"."withdrawal_status" NOT NULL DEFAULT 'pending',
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

-- ONE WITHDRAWAL PER CLIENT REFERENCE, PER USER. The anti-double-debit rule:
-- without it, a client that retries a timed-out request opens a second
-- withdrawal and the user pays twice for one intent.
CREATE UNIQUE INDEX IF NOT EXISTS "withdrawals_client_ref_idx" ON "pay"."withdrawals" ("user_id", "client_ref");
CREATE INDEX IF NOT EXISTS "withdrawals_user_idx" ON "pay"."withdrawals" ("user_id", "created_at");
-- THE STUCK-IN-FLIGHT QUERY. `held` is the one state where a user's value is
-- immobilised — out of `available`, not yet gone. An operator must be able to
-- list those without a scan.
CREATE INDEX IF NOT EXISTS "withdrawals_status_idx" ON "pay"."withdrawals" ("status");

ALTER TABLE "pay"."withdrawals" DROP CONSTRAINT IF EXISTS "withdrawals_amount_positive_ck";
ALTER TABLE "pay"."withdrawals" ADD CONSTRAINT "withdrawals_amount_positive_ck"
  CHECK ("amount" > 0);

-- A negative attempt count would collide with an earlier attempt's idempotency
-- key, which is the one thing this column exists to prevent.
ALTER TABLE "pay"."withdrawals" DROP CONSTRAINT IF EXISTS "withdrawals_attempts_non_negative_ck";
ALTER TABLE "pay"."withdrawals" ADD CONSTRAINT "withdrawals_attempts_non_negative_ck"
  CHECK ("attempts" >= 0);

-- A withdrawal that reports itself sent without a rail reference cannot be
-- traced to the movement that sent it, which is the only evidence the user's
-- money went where they asked.
ALTER TABLE "pay"."withdrawals" DROP CONSTRAINT IF EXISTS "withdrawals_sent_ref_ck";
ALTER TABLE "pay"."withdrawals" ADD CONSTRAINT "withdrawals_sent_ref_ck"
  CHECK ("status" <> 'sent' OR "rail_ref" IS NOT NULL);
