-- svc-notify · channels (ops.notifications — fan-out beyond the inbox)
-- Reversal: 0001_notify_channels.down.sql
--
-- Two tables, and the split between them is the design.
--
-- channel_targets  An address the USER gave us and CONFIRMED. svc-notify owns it
--                  rather than reading identity.users.email: §2 forbids reaching
--                  into another service's tables, and a login address is not
--                  consent to be texted.
--
-- deliveries       One row per (notification, channel) recording the ATTEMPT and
--                  the OUTCOME as separate facts. attempted_at says we tried;
--                  delivered_at says a transport accepted it. A notification
--                  that was never delivered cannot read as delivered, because
--                  there is no single column that would let it.
--
-- Still no balances and no ledger transactions in this service.

CREATE TABLE IF NOT EXISTS "notify"."channel_targets" (
  "user_id"            text NOT NULL,
  "channel"            text NOT NULL,
  "address"            text NOT NULL,
  "locale"             text NOT NULL DEFAULT 'en',
  -- NULL means never confirmed. Nothing is ever sent to an unconfirmed address.
  "verified_at"        timestamptz,
  -- SHA-256 of the confirmation code, never the code. Reading this table must
  -- not let anyone confirm somebody else's phone number.
  "verify_token_hash"  text,
  "verify_expires_at"  timestamptz,
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "channel_targets_pk" PRIMARY KEY ("user_id", "channel")
);

-- inapp is not a target: it needs no address and cannot be unsubscribed from
-- without losing the record of what the user was told.
ALTER TABLE "notify"."channel_targets" DROP CONSTRAINT IF EXISTS "channel_targets_channel_ck";
ALTER TABLE "notify"."channel_targets" ADD CONSTRAINT "channel_targets_channel_ck"
  CHECK ("channel" IN ('email', 'push', 'sms'));

-- A confirmed target must have spent its token; an unconfirmed one that carries
-- a token must carry its expiry too. Without this, a row could sit with a live
-- code forever and be confirmed by a replay months later.
ALTER TABLE "notify"."channel_targets" DROP CONSTRAINT IF EXISTS "channel_targets_verify_ck";
ALTER TABLE "notify"."channel_targets" ADD CONSTRAINT "channel_targets_verify_ck"
  CHECK (("verify_token_hash" IS NULL) = ("verify_expires_at" IS NULL));

CREATE INDEX IF NOT EXISTS "channel_targets_verified_idx"
  ON "notify"."channel_targets" ("user_id") WHERE "verified_at" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "notify"."deliveries" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "notification_id"  uuid NOT NULL REFERENCES "notify"."notifications" ("id") ON DELETE CASCADE,
  "channel"          text NOT NULL,
  "status"           text NOT NULL DEFAULT 'pending',
  "attempts"         integer NOT NULL DEFAULT 0,
  -- We tried to send. NULL on a pure refusal — nothing was attempted.
  "attempted_at"     timestamptz,
  -- A transport accepted it. The ONLY column that may read as "the user was told".
  "delivered_at"     timestamptz,
  "refusal_code"     text,
  "detail"           text,
  "reference"        text,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "notify"."deliveries" DROP CONSTRAINT IF EXISTS "deliveries_channel_ck";
ALTER TABLE "notify"."deliveries" ADD CONSTRAINT "deliveries_channel_ck"
  CHECK ("channel" IN ('inapp', 'email', 'push', 'sms'));

ALTER TABLE "notify"."deliveries" DROP CONSTRAINT IF EXISTS "deliveries_status_ck";
ALTER TABLE "notify"."deliveries" ADD CONSTRAINT "deliveries_status_ck"
  CHECK ("status" IN ('pending', 'delivered', 'refused', 'failed', 'abandoned'));

-- THE INVARIANT, ENFORCED BY THE DATABASE RATHER THAN BY EVERY CALLER:
--   delivered_at is set if and only if status = 'delivered'.
-- A bug that wrote delivered_at on a failure would make an undelivered margin
-- call indistinguishable from a delivered one, which is the exact failure this
-- table exists to prevent. So the database refuses the row.
ALTER TABLE "notify"."deliveries" DROP CONSTRAINT IF EXISTS "deliveries_delivered_ck";
ALTER TABLE "notify"."deliveries" ADD CONSTRAINT "deliveries_delivered_ck"
  CHECK (("status" = 'delivered') = ("delivered_at" IS NOT NULL));

-- There is deliberately NO constraint forbidding attempted_at on a refused row.
-- A channel can be attempted, fail, and later refuse because its credentials
-- were removed — attempted_at then honestly records the last time we tried, and
-- a constraint would have forced the code to erase that. The invariant worth
-- enforcing is the one above: nothing reads as delivered unless it was.

-- THE IDEMPOTENCY GUARD. At-least-once bus delivery replays events; this key is
-- what turns the replay into a no-op instead of a second email. It is a UNIQUE
-- INDEX rather than application state because two replicas of this service
-- consume the same durable consumer, and process-local memory would let both
-- send.
CREATE UNIQUE INDEX IF NOT EXISTS "deliveries_notification_channel_idx"
  ON "notify"."deliveries" ("notification_id", "channel");

-- Operator query: what is stuck, per channel.
CREATE INDEX IF NOT EXISTS "deliveries_status_idx"
  ON "notify"."deliveries" ("status", "channel") WHERE "status" IN ('pending', 'failed');
