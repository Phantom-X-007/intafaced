-- connect_lake.lake_ticks — normalized capture rows for connect.data-lake (§27:762).
-- Reversal: operator drops schema; package ships forward-only SQL.
--
-- Measured capture facts only. Absent rows stay in the in-process log — never
-- persisted as synthetic quiet markets. Retention TTL is owner env, not defaulted here.

CREATE SCHEMA IF NOT EXISTS connect_lake;

CREATE TABLE IF NOT EXISTS connect_lake.lake_ticks (
  id           bigserial PRIMARY KEY,
  venue_id     text        NOT NULL,
  symbol       text        NOT NULL,
  captured_at  timestamptz NOT NULL,
  payload      jsonb       NOT NULL,
  seq          bigint
);

CREATE INDEX IF NOT EXISTS lake_ticks_venue_symbol_captured_idx
  ON connect_lake.lake_ticks (venue_id, symbol, captured_at DESC);

CREATE INDEX IF NOT EXISTS lake_ticks_captured_at_idx
  ON connect_lake.lake_ticks (captured_at DESC);
