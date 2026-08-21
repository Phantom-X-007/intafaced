-- svc-market · market.commerce Stage 3 — listing subscriptions
-- Reversal: 0003_market_subscriptions.down.sql
--
-- Period is an integer number of seconds ON THE LISTING. There is no default
-- month (or any other invented cadence). A leftover subscription row without
-- period_seconds cannot be sold — purchase refuses by name.
-- Access windows live on the purchase that paid for them (marketPurchase).
-- Cancel is a flag, not a reverse recipe: it stops new access, it does not refund.

ALTER TABLE "market"."listings"
  ADD COLUMN IF NOT EXISTS "period_seconds" integer;

DO $$ BEGIN
  ALTER TABLE "market"."listings"
    ADD CONSTRAINT "listings_period_seconds_positive"
    CHECK ("period_seconds" IS NULL OR "period_seconds" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "market"."purchases"
  ADD COLUMN IF NOT EXISTS "access_until" timestamptz;

CREATE TABLE IF NOT EXISTS "market"."subscription_state" (
  "listing_id"    uuid NOT NULL REFERENCES "market"."listings"("id"),
  "buyer_id"      uuid NOT NULL,
  "cancelled_at"  timestamptz,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("listing_id", "buyer_id")
);

CREATE INDEX IF NOT EXISTS "purchases_subscription_access_idx"
  ON "market"."purchases" ("listing_id", "buyer_id")
  WHERE "access_until" IS NOT NULL;
