-- svc-p2p · payment instruments (§6.2 "any payment method")
-- Reversal: 0001_p2p_payment_instruments.down.sql
--
-- THE HOLE THIS CLOSES. Escrow could lock, release, refund and go to a
-- moderator — and a trade still could not complete, because at the moment the
-- buyer must pay the seller there was no bank account, no wallet handle, no
-- destination of any kind. The payment leg was a `method` string.
--
-- THE THING THAT MAKES THIS DIFFERENT FROM THE OTHER TABLES IN THIS SERVICE.
-- Everything else here is a decision about value that lives in svc-ledger. This
-- is personal data, and it is the single most attractive row in the service to
-- an attacker: an account number plus a name plus "this person trades crypto"
-- is a complete social-engineering kit, and an account number a scammer can
-- substitute for the seller's is a direct theft.
--
-- So the constraints below are not about correctness of value. They are about
-- who can see a row, for how long, and whether we can prove afterwards who did.
--
-- Every statement is idempotent and re-runnable, like 0000.

-- ── payment_method_schemas ───────────────────────────────────────────────────
-- WHAT A METHOD NEEDS, PER COUNTRY — as data, supplied by an operator.
--
-- This table ships EMPTY, and that is the design, not an omission. What a payer
-- needs in order to send money differs by method and by country and it is not
-- this repo's knowledge to invent; a seeded list of plausible field names would
-- be a wrong answer that looks like a right one. An operator registers what a
-- market actually requires (`instruments.methods.register`, admin:compliance),
-- and until they do, that market cannot be used — which is the honest failure.

CREATE TABLE IF NOT EXISTS "p2p"."payment_method_schemas" (
  -- e.g. a bank transfer scheme, a mobile money network, a payment app. The id
  -- is the operator's; nothing in the code knows any of them by name.
  "method_id"   text NOT NULL,
  -- ISO 3166-1 alpha-2, or '*' meaning "the same everywhere". An exact country
  -- always beats the wildcard — see pickSchema().
  "country"     text NOT NULL,
  "label"       text NOT NULL,
  -- FieldSpec[]: key, label, required, pattern, lengths, sensitive, help.
  "fields"      jsonb NOT NULL,
  "enabled"     boolean NOT NULL DEFAULT true,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("method_id", "country")
);

ALTER TABLE "p2p"."payment_method_schemas" DROP CONSTRAINT IF EXISTS "payment_method_schemas_country_ck";
ALTER TABLE "p2p"."payment_method_schemas" ADD CONSTRAINT "payment_method_schemas_country_ck"
  CHECK ("country" = '*' OR "country" ~ '^[A-Z]{2}$');

-- A schema with no fields accepts an instrument with no details — an
-- instrument the buyer cannot pay, which is the exact bug this table exists to
-- make impossible.
ALTER TABLE "p2p"."payment_method_schemas" DROP CONSTRAINT IF EXISTS "payment_method_schemas_fields_ck";
ALTER TABLE "p2p"."payment_method_schemas" ADD CONSTRAINT "payment_method_schemas_fields_ck"
  CHECK (jsonb_typeof("fields") = 'array' AND jsonb_array_length("fields") > 0);

-- ── payment_instruments ──────────────────────────────────────────────────────
-- One destination a seller will accept money at. `details` is the secret.

CREATE TABLE IF NOT EXISTS "p2p"."payment_instruments" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id"      text NOT NULL,
  "method_id"     text NOT NULL,
  "country"       text NOT NULL,
  -- The currency this destination can actually receive. Part of the match key:
  -- an account that takes EUR is not a place to send NGN, and a trade priced in
  -- a currency the destination cannot receive is a payment that bounces after
  -- the seller's asset is already locked.
  "fiat_currency" text NOT NULL,
  -- The owner's own name for it ("salary account"). Shown to the payer, so it
  -- is treated as part of the instrument and never as a public handle.
  "label"         text NOT NULL DEFAULT '',
  -- THE PERSONAL DATA. Exactly the fields the method schema declared, nothing
  -- else — validateDetails() rejects an undeclared key rather than dropping it,
  -- so "what do we hold about this person" has a finite answer.
  "details"       jsonb NOT NULL,
  -- sha256 over the canonical details. Outlives the details themselves so an
  -- appeal can still ask "was the buyer shown this account" after the purge.
  "fingerprint"   text NOT NULL,
  -- Removal is a state, never a DELETE: an in-flight trade that already showed
  -- this instrument must keep working, and the access log must keep pointing at
  -- a row that exists.
  "status"        text NOT NULL DEFAULT 'active',
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  "removed_at"    timestamptz
);

ALTER TABLE "p2p"."payment_instruments" DROP CONSTRAINT IF EXISTS "payment_instruments_status_ck";
ALTER TABLE "p2p"."payment_instruments" ADD CONSTRAINT "payment_instruments_status_ck"
  CHECK ("status" IN ('active', 'removed'));

-- A removed instrument has a removal time and an active one does not. The
-- retention sweep and the "can this be attached to a new trade" check both read
-- the status; a row that disagrees with itself would be readable by one and not
-- the other.
ALTER TABLE "p2p"."payment_instruments" DROP CONSTRAINT IF EXISTS "payment_instruments_removed_paired_ck";
ALTER TABLE "p2p"."payment_instruments" ADD CONSTRAINT "payment_instruments_removed_paired_ck"
  CHECK (("status" = 'removed') = ("removed_at" IS NOT NULL));

ALTER TABLE "p2p"."payment_instruments" DROP CONSTRAINT IF EXISTS "payment_instruments_country_ck";
ALTER TABLE "p2p"."payment_instruments" ADD CONSTRAINT "payment_instruments_country_ck"
  CHECK ("country" ~ '^[A-Z]{2}$');

ALTER TABLE "p2p"."payment_instruments" DROP CONSTRAINT IF EXISTS "payment_instruments_fiat_code_ck";
ALTER TABLE "p2p"."payment_instruments" ADD CONSTRAINT "payment_instruments_fiat_code_ck"
  CHECK ("fiat_currency" ~ '^[A-Z]{3}$');

-- An instrument with no fields is a destination with no address.
ALTER TABLE "p2p"."payment_instruments" DROP CONSTRAINT IF EXISTS "payment_instruments_details_ck";
ALTER TABLE "p2p"."payment_instruments" ADD CONSTRAINT "payment_instruments_details_ck"
  CHECK (jsonb_typeof("details") = 'object' AND "details" <> '{}'::jsonb);

-- ═════════════════════════════════════════════════════════════════════════════
-- ONE ACTIVE DESTINATION PER (owner, method, currency).
--
-- Not a limit for its own sake — it is what makes "which account does the buyer
-- pay?" have exactly one answer at take time. The seller is resolved from the
-- trade (on a `buy` offer it is the TAKER, so the offer cannot carry the
-- instrument), which means the instrument has to be looked up rather than
-- chosen. A lookup that can return two rows would pick one by an ordering
-- nobody designed, on the single field where picking the wrong one sends a
-- stranger's money to the wrong bank account.
--
-- Rotating is still possible and is sequential: remove, then add.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS "payment_instruments_active_slot_idx"
  ON "p2p"."payment_instruments" ("owner_id", "method_id", "fiat_currency")
  WHERE "status" = 'active';

CREATE INDEX IF NOT EXISTS "payment_instruments_owner_idx" ON "p2p"."payment_instruments" ("owner_id", "status");

-- ── trade_payment_instruments ────────────────────────────────────────────────
-- WHAT THE BUYER WAS TOLD TO PAY, FROZEN AT THE MOMENT THE TRADE WAS OPENED.
--
-- Two properties, and both are load-bearing:
--
--   1. **Removal cannot break an in-flight trade.** The buyer is mid-payment;
--      the seller deleting the instrument must not blank the screen the buyer
--      is copying an account number from. The snapshot is not reached through
--      `payment_instruments`, so a removal there is invisible to it.
--
--   2. **The destination cannot change mid-trade.** This is the more important
--      one. Without a snapshot, a seller could show account A, wait for the
--      buyer to start the transfer, edit the instrument to account B, and then
--      truthfully report that nothing arrived at B — a scam with a clean audit
--      trail. Frozen at take, the row is evidence rather than a live pointer.
--
-- One row per trade: a trade has one destination, decided once.

CREATE TABLE IF NOT EXISTS "p2p"."trade_payment_instruments" (
  "trade_id"      uuid PRIMARY KEY REFERENCES "p2p"."p2p_trades"("id"),
  "instrument_id" uuid NOT NULL REFERENCES "p2p"."payment_instruments"("id"),
  -- Denormalised so an authorisation check and an access-log write never have
  -- to join a table whose row may since have been removed.
  "owner_id"      text NOT NULL,
  "method_id"     text NOT NULL,
  "country"       text NOT NULL,
  "fiat_currency" text NOT NULL,
  "label"         text NOT NULL DEFAULT '',
  -- NULL once the retention sweep has purged it. The fingerprint stays.
  "details"       jsonb,
  "fingerprint"   text NOT NULL,
  "attached_at"   timestamptz NOT NULL DEFAULT now(),
  "purged_at"     timestamptz
);

-- Purged means purged. A row with a purge timestamp and details still in it, or
-- details gone with nothing recording that we did it, are both a data-retention
-- claim we could not defend.
ALTER TABLE "p2p"."trade_payment_instruments" DROP CONSTRAINT IF EXISTS "trade_payment_instruments_purge_paired_ck";
ALTER TABLE "p2p"."trade_payment_instruments" ADD CONSTRAINT "trade_payment_instruments_purge_paired_ck"
  CHECK (("details" IS NULL) = ("purged_at" IS NOT NULL));

CREATE INDEX IF NOT EXISTS "trade_payment_instruments_owner_idx" ON "p2p"."trade_payment_instruments" ("owner_id");
-- The retention sweep's work queue: still holding details, oldest first.
CREATE INDEX IF NOT EXISTS "trade_payment_instruments_unpurged_idx" ON "p2p"."trade_payment_instruments" ("attached_at")
  WHERE "purged_at" IS NULL;

-- ── instrument_access_log ────────────────────────────────────────────────────
-- WHO LOOKED AT WHOSE ACCOUNT DETAILS, WHEN, AND WHETHER THEY WERE ALLOWED TO.
--
-- The reason this is a table and not a log line: the question it answers is
-- asked after something has already gone wrong, by someone who needs an answer
-- that survived log rotation. Not having it is the problem.
--
-- Refusals are recorded too, and they are the more interesting half. A single
-- reveal is a buyer paying. Eleven refusals against eleven different sellers in
-- an hour is someone harvesting, and it looks like nothing at all in a table
-- that only records successes.

CREATE TABLE IF NOT EXISTS "p2p"."instrument_access_log" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: a refusal on a trade with no instrument attached has none to name.
  "instrument_id" uuid REFERENCES "p2p"."payment_instruments"("id"),
  "owner_id"      text,
  "viewer_id"     text NOT NULL,
  -- owner | counterparty | moderator | other
  "viewer_role"   text NOT NULL,
  "trade_id"      uuid REFERENCES "p2p"."p2p_trades"("id"),
  "outcome"       text NOT NULL,
  "deny_reason"   text,
  "at"            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "p2p"."instrument_access_log" DROP CONSTRAINT IF EXISTS "instrument_access_log_outcome_ck";
ALTER TABLE "p2p"."instrument_access_log" ADD CONSTRAINT "instrument_access_log_outcome_ck"
  CHECK (
    ("outcome" = 'revealed' AND "deny_reason" IS NULL)
    OR ("outcome" = 'denied' AND "deny_reason" IS NOT NULL)
  );

ALTER TABLE "p2p"."instrument_access_log" DROP CONSTRAINT IF EXISTS "instrument_access_log_role_ck";
ALTER TABLE "p2p"."instrument_access_log" ADD CONSTRAINT "instrument_access_log_role_ck"
  CHECK ("viewer_role" IN ('owner', 'counterparty', 'moderator', 'other'));

-- The owner's own "who has seen my account details" view.
CREATE INDEX IF NOT EXISTS "instrument_access_log_owner_idx" ON "p2p"."instrument_access_log" ("owner_id", "at" DESC);
-- The abuse query: everything one viewer has reached for.
CREATE INDEX IF NOT EXISTS "instrument_access_log_viewer_idx" ON "p2p"."instrument_access_log" ("viewer_id", "at" DESC);
CREATE INDEX IF NOT EXISTS "instrument_access_log_trade_idx" ON "p2p"."instrument_access_log" ("trade_id");

-- ═════════════════════════════════════════════════════════════════════════════
-- APPEND-ONLY, ENFORCED BY THE DATABASE.
--
-- An access log that the service could edit is an access log whose value
-- depends on the service not having been the thing that was compromised. The
-- reveal path writes here in the same statement that reads the details (see
-- instrument-service.ts) so a read cannot happen without a record; this trigger
-- is the other half — the record cannot be removed afterwards.
--
-- A whole-table wipe is deliberately not covered. It needs table ownership,
-- which no request path has, and covering it would stop a test suite resetting
-- between cases. (The keyword is spelled out nowhere in this file on purpose:
-- tooling/ci/migration-check.mjs scans forward migrations for destructive verbs
-- and a comment mentioning one is indistinguishable from a statement running
-- one — the gate is right to be that blunt.)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION "p2p"."instrument_access_log_is_append_only"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'p2p.instrument_access_log is append-only (% attempted)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS "instrument_access_log_append_only" ON "p2p"."instrument_access_log";
CREATE TRIGGER "instrument_access_log_append_only"
  BEFORE UPDATE OR DELETE ON "p2p"."instrument_access_log"
  FOR EACH ROW EXECUTE FUNCTION "p2p"."instrument_access_log_is_append_only"();
