-- intafaced:destructive — reversal of 0012_funding_period_skips.sql

DROP INDEX IF EXISTS "trade"."funding_period_skips_market_idx";
DROP INDEX IF EXISTS "trade"."funding_period_skips_period_idx";
DROP TABLE IF EXISTS "trade"."funding_period_skips";
