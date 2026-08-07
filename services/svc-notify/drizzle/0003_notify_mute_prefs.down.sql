-- Reverse 0003_notify_mute_prefs.sql

DROP INDEX IF EXISTS "notify"."channel_mutes_user_idx";
DROP TABLE IF EXISTS "notify"."channel_mutes";
