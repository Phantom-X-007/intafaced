-- trade.futures · funding skip audit (ADR futures-risk done bar §5)
-- Reversal: 0012_funding_period_skips.down.sql
--
-- Skips (no_rate / no_positions) are recorded as skips — distinguishable from
-- zero-rate / one-sided periods which mark funding_periods.settled with leg_count=0.
-- A skip does NOT block a later settle when a rate appears (no_rate may retry).

CREATE TABLE IF NOT EXISTS "trade"."funding_period_skips" (
  "id"           bigserial PRIMARY KEY,
  "period_id"    text NOT NULL,
  "market_id"    text NOT NULL,
  "reason"       text NOT NULL,
  "recorded_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "funding_period_skips_reason_ck"
    CHECK ("reason" IN ('no_rate', 'no_positions'))
);

CREATE INDEX IF NOT EXISTS "funding_period_skips_period_idx"
  ON "trade"."funding_period_skips" ("period_id");

CREATE INDEX IF NOT EXISTS "funding_period_skips_market_idx"
  ON "trade"."funding_period_skips" ("market_id", "recorded_at" DESC);
