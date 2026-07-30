-- HOSTED CHECKOUT (§6.1 "payment links + hosted checkout").
--
-- 0002 gave payment links a hosted PAGE. A page is not a checkout: it renders a
-- label and an amount and tells the payer to go and finish somewhere else.
-- This migration adds the thing that turns a link into a payment — a CHECKOUT
-- SESSION — and tightens the link itself, because a payment link is a
-- capability URL and whoever holds one can pay against it.
--
-- WHAT A SESSION IS FOR, IN ONE SENTENCE: it is the row that freezes what is
-- being charged, to whom, on which rail, at the moment an anonymous payer said
-- "yes" — so that nothing after that moment can be influenced by the browser.
--
-- WHOSE MONEY IS STRANDED IF THE PROCESS DIES HERE. Nobody's, and the reason is
-- the split between `checkout_sessions.status` and `payments.status`. A session
-- is a BROWSER HANDOFF and it expires in minutes. A payment is a claim on money
-- and it does not expire at all. A payer who sends funds after their session
-- lapsed has still sent funds to an acceptance address derived from the payment
-- id, and the rail's webhook still matches the payment by `rail_ref` and still
-- books it. Expiring the payment alongside the session is what WOULD strand
-- them, which is exactly why these are two columns on two tables.

-- ── payment links: expiry, and a use bound ───────────────────────────────────
--
-- `max_uses` NULL means unbounded, which is the honest default for a link:
-- a use is consumed by a COMPLETED payment, and a completed payment is revenue,
-- not abuse. The dangerous property of a capability URL is not that it can be
-- paid twice, it is that it lives forever — so the expiry is what the service
-- now defaults and caps, and the use bound is what a merchant opts into for an
-- invoice that should only ever be paid once.
--
-- `uses` counts completed payments. It is advisory under concurrency and the
-- service says so: money that has actually arrived is always booked, even if it
-- takes the link one past its bound. The bound is checked where nothing has
-- moved yet — at session open.

ALTER TABLE "pay"."payment_links" ADD COLUMN IF NOT EXISTS "max_uses" integer;
ALTER TABLE "pay"."payment_links" ADD COLUMN IF NOT EXISTS "uses" integer NOT NULL DEFAULT 0;

ALTER TABLE "pay"."payment_links" DROP CONSTRAINT IF EXISTS "payment_links_max_uses_positive";
ALTER TABLE "pay"."payment_links"
  ADD CONSTRAINT "payment_links_max_uses_positive" CHECK ("max_uses" IS NULL OR "max_uses" > 0);

ALTER TABLE "pay"."payment_links" DROP CONSTRAINT IF EXISTS "payment_links_uses_non_negative";
ALTER TABLE "pay"."payment_links"
  ADD CONSTRAINT "payment_links_uses_non_negative" CHECK ("uses" >= 0);

-- ── checkout sessions ────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "pay"."checkout_session_status" AS ENUM ('open', 'completed', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "pay"."checkout_sessions" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "link_id"      uuid NOT NULL REFERENCES "pay"."payment_links"("id"),
  "merchant_id"  uuid NOT NULL REFERENCES "pay"."merchants"("id"),
  -- The payment this session opened. NULL only in the instant between the
  -- session row and the payment row, and the service writes both in one
  -- transaction so that instant is never observable.
  "payment_id"   uuid REFERENCES "pay"."payments"("id"),
  -- Only the hash is stored, exactly as with the link token. The raw session
  -- token is handed to one browser once and never again.
  "token_hash"   text NOT NULL,
  "token_prefix" text NOT NULL,
  -- FROZEN AT OPEN. This is the column that makes client-side amount tampering
  -- impossible rather than merely discouraged: after this row exists, nothing
  -- the browser sends is ever read again when deciding what is being charged.
  "amount"       numeric(38, 18) NOT NULL,
  "currency"     text NOT NULL,
  -- Chosen SERVER-SIDE from configuration. A hosted checkout that lets its
  -- caller name a rail is the route back to the P0 that `rails/posture.ts`
  -- exists to close, so the payer names a method at most and never a rail.
  "rail_adapter" text NOT NULL,
  -- Rail instruction for the payer — an acceptance address and what to send.
  -- Never a secret, never merchant configuration: only what this one payer
  -- needs in order to pay.
  "instruction"  jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status"       "pay"."checkout_session_status" NOT NULL DEFAULT 'open',
  -- Minutes, not days. A session is a browser handoff; see the note at the top
  -- for why this expiring does not expire the payment behind it.
  "expires_at"   timestamptz NOT NULL,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "checkout_sessions_amount_positive" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "checkout_sessions_token_hash_idx"
  ON "pay"."checkout_sessions" ("token_hash");

-- ONE SESSION PER PAYMENT. Two sessions pointing at one payment would mean two
-- browsers being told they are each responsible for the same money.
CREATE UNIQUE INDEX IF NOT EXISTS "checkout_sessions_payment_idx"
  ON "pay"."checkout_sessions" ("payment_id") WHERE "payment_id" IS NOT NULL;

-- The open-session count per link, which is the cheap floor under an anonymous
-- caller opening rows off one URL forever.
CREATE INDEX IF NOT EXISTS "checkout_sessions_link_status_idx"
  ON "pay"."checkout_sessions" ("link_id", "status");

-- The expiry sweep.
CREATE INDEX IF NOT EXISTS "checkout_sessions_expiry_idx"
  ON "pay"."checkout_sessions" ("status", "expires_at");
