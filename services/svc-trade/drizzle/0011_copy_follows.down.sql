-- intafaced:destructive — reversal of 0011_copy_follows.sql

DROP INDEX IF EXISTS "trade"."copy_follows_follower_leader_idx";
DROP INDEX IF EXISTS "trade"."copy_follows_follower_idx";
DROP TABLE IF EXISTS "trade"."copy_period_stats";
DROP TABLE IF EXISTS "trade"."copy_follows";
