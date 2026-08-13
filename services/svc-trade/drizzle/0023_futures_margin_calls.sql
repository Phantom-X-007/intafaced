-- trade.futures · margin-call durability (D26-P1-T1b / DIRECTION MVP-2)
-- Reversal: 0023_futures_margin_calls.down.sql
--
-- Identity + delivery fact only. NO grace_expires_at — grace duration is D3
-- owner-reserved; C15 forbids starting a grace clock without transport, and
-- inventing a duration here would invent product law.
--
-- Money never lives here. health_bps is a diagnostic ratio at call time.

CREATE TABLE IF NOT EXISTS "trade"."position_margin_calls" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "position_id"   uuid NOT NULL,
  "user_id"       uuid NOT NULL,
  "market_id"     text NOT NULL,
  "sequence"      integer NOT NULL,
  "health_bps"    integer NOT NULL,
  "called_at"     timestamptz NOT NULL,
  "delivered_at"  timestamptz NOT NULL,
  "cleared_at"    timestamptz,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "position_margin_calls_seq_ck" CHECK ("sequence" >= 1),
  CONSTRAINT "position_margin_calls_health_ck" CHECK ("health_bps" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "position_margin_calls_seq_uidx"
  ON "trade"."position_margin_calls" ("position_id", "sequence");

-- At most one open (uncleared) call per position — re-ticks refresh it.
CREATE UNIQUE INDEX IF NOT EXISTS "position_margin_calls_open_uidx"
  ON "trade"."position_margin_calls" ("position_id")
  WHERE "cleared_at" IS NULL;

CREATE INDEX IF NOT EXISTS "position_margin_calls_user_open_idx"
  ON "trade"."position_margin_calls" ("user_id")
  WHERE "cleared_at" IS NULL;
