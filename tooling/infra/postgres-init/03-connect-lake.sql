-- connect.data-lake TSDB bootstrap — fleet postgres init (§27).
-- Role + schema + lake_ticks table. Retention TTL remains owner env only.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'svc_connect_lake') THEN
    CREATE ROLE svc_connect_lake LOGIN PASSWORD 'svc_connect_lake';
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS connect_lake AUTHORIZATION svc_connect_lake;

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

GRANT USAGE ON SCHEMA public TO svc_connect_lake;
ALTER ROLE svc_connect_lake SET search_path TO connect_lake, public;
