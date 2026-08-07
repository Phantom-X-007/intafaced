-- svc-notify · durable out-of-app mute preferences
-- Reversal: 0003_notify_mute_prefs.down.sql
--
-- Mute prefs used to live only in process memory (MemoryMuteStore). A user who
-- muted email, then watched the service restart, silently received email again
-- — the API said muted, the next boot said unmuted, and no delivery row explained
-- the flip. Preferences that decide whether a gateway is even attempted must
-- survive the process the same way targets and deliveries do.
--
-- Presence of a row = muted for that (user, channel). Critical severity still
-- ignores mute in dispatch (code law); this table never stores a "mute critical"
-- flag because that product answer is no.

CREATE TABLE IF NOT EXISTS "notify"."channel_mutes" (
  "user_id"     text NOT NULL,
  "channel"     text NOT NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "channel_mutes_pk" PRIMARY KEY ("user_id", "channel")
);

ALTER TABLE "notify"."channel_mutes" DROP CONSTRAINT IF EXISTS "channel_mutes_channel_ck";
ALTER TABLE "notify"."channel_mutes" ADD CONSTRAINT "channel_mutes_channel_ck"
  CHECK ("channel" IN ('email', 'push', 'sms'));

CREATE INDEX IF NOT EXISTS "channel_mutes_user_idx"
  ON "notify"."channel_mutes" ("user_id");
