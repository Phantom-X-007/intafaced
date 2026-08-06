-- MERCHANT STATE GETS A HISTORY, AND A WRITER.
--
-- `docs/adr/2026-08-04-pay-rails-and-psp-socket.md` (Accepted) named this as one
-- of three defects in the current pay surface:
--
--   "Merchant state has no history and no writer. `status='suspended'` is read
--    and enforced by a code path that nothing writes. Merchant MONEY is already
--    irreversible while merchant STATE is unrecorded — so a suspension cannot be
--    explained, dated, or undone, and an operator cannot answer 'why is this
--    merchant suspended' from the database."
--
-- The asymmetry is the point. `payments` has `payment_events`, append-only and
-- enforced by a trigger, because §6.1 requires a full state history for the
-- thing money flows through. `merchants.status` is the switch that decides
-- WHETHER money flows at all — `payment.create` and the hosted checkout both
-- refuse a suspended merchant — and it had a single mutable column and no log.
-- A merchant asking why they were cut off could be answered only from memory.
--
-- WHAT THIS DOES NOT DO, deliberately: it does not decide WHEN a merchant should
-- be suspended. There is no rule here, no threshold, no automatic transition.
-- Recording who, when and why is not the same as deciding when, and the second
-- is a product policy that belongs to the owner. This is the first half only.
--
-- NUMBERED 0006, NOT 0005. PR #346 is open and adds `0005_pay_merchant_kyb`.
-- Two different migrations answering to one number is a filename collision in a
-- runner that keys applied migrations by name, so the gap is deliberate and it
-- closes when #346 lands.

CREATE TABLE IF NOT EXISTS "pay"."merchant_status_events" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- `bigserial`, for the same reason `payment_events` has one: `now()` inside a
  -- transaction is the TRANSACTION'S start time, so two transitions written by
  -- one statement share a timestamp and cannot be ordered by it. A history that
  -- cannot say which change came first is not a history.
  "seq"         bigserial NOT NULL,

  "merchant_id" uuid NOT NULL REFERENCES "pay"."merchants"("id"),

  -- BOTH SIDES OF THE TRANSITION, not just the new value.
  --
  -- Storing only `to_status` makes the history depend on reading every prior row
  -- to know what changed, and makes the FIRST row unreadable — there is nothing
  -- before it to compare against. Storing both means one row answers "what
  -- happened" on its own, and a gap in the chain (`from` not matching the
  -- previous `to`) is detectable rather than invisible.
  "from_status" "pay"."merchant_status" NOT NULL,
  "to_status"   "pay"."merchant_status" NOT NULL,

  -- REQUIRED, and free text on purpose.
  --
  -- The ADR's test is "an operator cannot answer 'why is this merchant
  -- suspended' from the database". A nullable reason fails that test on the
  -- first row somebody is in a hurry for. An enum of reasons would fail it
  -- differently: it would force every real situation into whichever of five
  -- codes was least wrong, and the actual explanation would go in a ticket
  -- nobody keeps. The check below refuses an empty string, so "required" means
  -- required rather than a space.
  "reason"      text NOT NULL CONSTRAINT "merchant_status_events_reason_not_blank" CHECK (length(btrim("reason")) > 0),

  -- WHO. An operator's user id, from the authenticated principal — never from a
  -- request body, or the field records who the caller said they were.
  "actor_id"    text NOT NULL,

  -- WHAT AUTHORISED IT. The scope the caller actually held. Recorded because
  -- scope law changes over time, and "this was done under admin:write in August"
  -- is a different fact from "whoever did this would need admin:write today".
  "actor_scope" text NOT NULL,

  "created_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "merchant_status_events_seq_idx"
  ON "pay"."merchant_status_events" ("seq");

-- The query an operator actually runs: this merchant, newest first.
CREATE INDEX IF NOT EXISTS "merchant_status_events_merchant_idx"
  ON "pay"."merchant_status_events" ("merchant_id", "seq" DESC);

-- APPEND-ONLY, ENFORCED BY THE DATABASE — the same trigger shape
-- `payment_events` uses, and for a stronger reason.
--
-- A suspension history that can be edited is worse than none: it looks like
-- evidence and is not. If a suspension was wrong, the correction is a NEW ROW
-- reinstating the merchant with a reason, exactly the way a ledger reverses a
-- posting rather than amending it. Both rows stay, and the trail reads "we
-- suspended them on the 3rd for this, and we were wrong on the 5th" — which is
-- the only version of that story a merchant, or a regulator, can check.
CREATE OR REPLACE FUNCTION "pay"."merchant_status_events_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'pay.merchant_status_events is append-only: % is not permitted. Reinstate with a new row, do not edit the old one.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS "merchant_status_events_append_only_trg" ON "pay"."merchant_status_events";
CREATE TRIGGER "merchant_status_events_append_only_trg"
  BEFORE UPDATE OR DELETE ON "pay"."merchant_status_events"
  FOR EACH ROW EXECUTE FUNCTION "pay"."merchant_status_events_append_only"();
