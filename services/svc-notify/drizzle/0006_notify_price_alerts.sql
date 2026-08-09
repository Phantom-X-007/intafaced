-- svc-notify · v22.alerts MVP price watchlists
-- Reversal: 0006_notify_price_alerts.down.sql
--
-- Price alerts ride the existing fan-out (inbox + channels). This table is the
-- watchlist only: condition, owner, and whether it has already fired.
-- target_price is text (decimal string) — never a float/numeric money type that
-- would invite JS number conversion at the edge.

CREATE TABLE IF NOT EXISTS "notify"."price_alerts" (
  "id"            uuid PRIMARY KEY,
  "user_id"       text NOT NULL,
  "market_id"     text NOT NULL,
  "direction"     text NOT NULL,
  "target_price"  text NOT NULL,
  "status"        text NOT NULL DEFAULT 'active',
  "fired_at"      timestamptz,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "notify"."price_alerts" DROP CONSTRAINT IF EXISTS "price_alerts_direction_ck";
ALTER TABLE "notify"."price_alerts" ADD CONSTRAINT "price_alerts_direction_ck"
  CHECK ("direction" IN ('above', 'below'));

ALTER TABLE "notify"."price_alerts" DROP CONSTRAINT IF EXISTS "price_alerts_status_ck";
ALTER TABLE "notify"."price_alerts" ADD CONSTRAINT "price_alerts_status_ck"
  CHECK ("status" IN ('active', 'fired', 'cancelled'));

CREATE INDEX IF NOT EXISTS "price_alerts_user_created_idx"
  ON "notify"."price_alerts" ("user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "price_alerts_market_active_idx"
  ON "notify"."price_alerts" ("market_id")
  WHERE "status" = 'active';
