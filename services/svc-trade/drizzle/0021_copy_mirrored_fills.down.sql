-- Reverse 0021_copy_mirrored_fills.sql
DROP INDEX IF EXISTS "trade"."copy_mirrored_fills_leader_idx";
DROP INDEX IF EXISTS "trade"."copy_mirrored_fills_follower_idx";
DROP TABLE IF EXISTS "trade"."copy_mirrored_fills";
