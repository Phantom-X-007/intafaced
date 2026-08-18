-- svc-notify · shared register/verify rate windows
-- Reversal: 0005_notify_target_rate_windows.down.sql
--
-- Register and verify used an in-process sliding window. That stops one
-- replica from flooding a gateway; N replicas each hold their own counters and
-- allow roughly N× the budget (README residual after #1187). Preferences and
-- delivery claims already live in Postgres so two replicas agree — the rate
-- budget must too, or the "named refuse before send" promise is only true on
-- a single process.
--
-- One row per (user, channel, op). `hit_count` is the takes inside the open
-- window; when the window expires the next take resets both fields. Claim is
-- SELECT … FOR UPDATE inside a transaction so concurrent replicas cannot both
-- take the last slot.

CREATE TABLE IF NOT EXISTS "notify"."target_rate_windows" (
  "user_id"       text NOT NULL,
  "channel"       text NOT NULL,
  "op"            text NOT NULL,
  "window_start"  timestamptz NOT NULL,
  "hit_count"     integer NOT NULL DEFAULT 0,
  CONSTRAINT "target_rate_windows_pk" PRIMARY KEY ("user_id", "channel", "op")
);

ALTER TABLE "notify"."target_rate_windows" DROP CONSTRAINT IF EXISTS "target_rate_windows_channel_ck";
ALTER TABLE "notify"."target_rate_windows" ADD CONSTRAINT "target_rate_windows_channel_ck"
  CHECK ("channel" IN ('email', 'push', 'sms'));

ALTER TABLE "notify"."target_rate_windows" DROP CONSTRAINT IF EXISTS "target_rate_windows_op_ck";
ALTER TABLE "notify"."target_rate_windows" ADD CONSTRAINT "target_rate_windows_op_ck"
  CHECK ("op" IN ('register', 'verify'));

ALTER TABLE "notify"."target_rate_windows" DROP CONSTRAINT IF EXISTS "target_rate_windows_hit_count_ck";
ALTER TABLE "notify"."target_rate_windows" ADD CONSTRAINT "target_rate_windows_hit_count_ck"
  CHECK ("hit_count" >= 0);
