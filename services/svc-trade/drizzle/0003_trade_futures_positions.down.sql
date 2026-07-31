DROP INDEX IF EXISTS "trade"."positions_open_unique_idx";
DROP INDEX IF EXISTS "trade"."positions_market_idx";
DROP INDEX IF EXISTS "trade"."positions_user_status_idx";
DROP TABLE IF EXISTS "trade"."positions";
DROP TYPE IF EXISTS "trade"."position_status";
DROP TYPE IF EXISTS "trade"."margin_mode";
DROP TYPE IF EXISTS "trade"."position_side";
