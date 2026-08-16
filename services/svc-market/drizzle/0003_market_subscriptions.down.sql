-- Reverse 0003_market_subscriptions.sql
DROP INDEX IF EXISTS "market"."purchases_subscription_access_idx";
DROP TABLE IF EXISTS "market"."subscription_state";
ALTER TABLE "market"."purchases" DROP COLUMN IF EXISTS "access_until";
ALTER TABLE "market"."listings" DROP CONSTRAINT IF EXISTS "listings_period_seconds_positive";
ALTER TABLE "market"."listings" DROP COLUMN IF EXISTS "period_seconds";
