-- intafaced:destructive — reversal of 0019_funding_period_membership.sql
DROP INDEX IF EXISTS "trade"."funding_period_membership_market_idx";
DROP TABLE IF EXISTS "trade"."funding_period_membership";
