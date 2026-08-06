-- Spot OHLCV materialization store (A-TRADE-SPOT-1).
-- Reversal: 0005_spot_candles.down.sql
--
-- Closed candles only, aggregated from real non-seeded taker fills.
-- REST fetchOHLCV still reads live from trade.fills; this table is the durable
-- copy written by the optional candle job (default OFF). Never invent empty
-- buckets here — absence is the honest signal.

CREATE TABLE IF NOT EXISTS "trade"."spot_candles" (
  "market_id"    uuid NOT NULL REFERENCES "trade"."markets" ("id"),
  "timeframe"    text NOT NULL,
  "open_time_ms" bigint NOT NULL,
  "open"         text NOT NULL,
  "high"         text NOT NULL,
  "low"          text NOT NULL,
  "close"        text NOT NULL,
  "volume"       text NOT NULL,
  PRIMARY KEY ("market_id", "timeframe", "open_time_ms")
);

CREATE INDEX IF NOT EXISTS "spot_candles_market_tf_time_idx"
  ON "trade"."spot_candles" ("market_id", "timeframe", "open_time_ms" DESC);

COMMENT ON TABLE "trade"."spot_candles" IS
  'Materialized OHLCV from non-seeded taker fills; job default OFF; no invented zeros';
