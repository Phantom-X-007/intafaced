-- trade.futures · tick stores (funding periods + liquidation attempts)
-- Reversal: 0004_futures_tick_stores.down.sql
--
-- Period / attempt IDENTITY only — never balances. Money is ledger-only.

CREATE TABLE IF NOT EXISTS "trade"."funding_periods" (
  "period_id"   text PRIMARY KEY,
  "market_id"   text NOT NULL,
  "leg_count"   integer NOT NULL DEFAULT 0,
  "settled_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "funding_periods_market_idx"
  ON "trade"."funding_periods" ("market_id");

CREATE TABLE IF NOT EXISTS "trade"."liquidation_attempts" (
  "liquidation_id" text PRIMARY KEY,
  "position_id"    uuid,
  "done_at"        timestamptz NOT NULL DEFAULT now()
);
