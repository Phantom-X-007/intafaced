-- trade.copy · durable follow + exposure store (Stage residual after #1010 TWAP)
-- Reversal: 0011_copy_follows.down.sql
--
-- Follows/envelopes lived in process Maps and vanished on restart. This keeps
-- parent follow state + open exposure so a restarted process resumes the same
-- envelope. Never stores rates, P&L, or invented §8 numbers — fee-share still
-- refuse-closed until owner publishes law.

CREATE TABLE IF NOT EXISTS "trade"."copy_follows" (
  "follow_id"                 text PRIMARY KEY,
  "follower_id"               text NOT NULL,
  "leader_id"                 text NOT NULL,
  "region"                    text NOT NULL,
  "permitted_markets"         jsonb NOT NULL,
  "max_notional_per_order"    numeric(38, 18) NOT NULL,
  "max_aggregate_exposure"    numeric(38, 18) NOT NULL,
  "expires_at"                timestamptz NOT NULL,
  "fee_share_killed"          boolean NOT NULL DEFAULT false,
  "exposure"                  numeric(38, 18) NOT NULL DEFAULT 0,
  "created_at"                timestamptz NOT NULL DEFAULT now(),
  "updated_at"                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "copy_follows_caps_positive_ck"
    CHECK ("max_notional_per_order" > 0 AND "max_aggregate_exposure" > 0),
  CONSTRAINT "copy_follows_exposure_nonneg_ck" CHECK ("exposure" >= 0)
);

CREATE INDEX IF NOT EXISTS "copy_follows_follower_idx"
  ON "trade"."copy_follows" ("follower_id");

CREATE UNIQUE INDEX IF NOT EXISTS "copy_follows_follower_leader_idx"
  ON "trade"."copy_follows" ("follower_id", "leader_id");

-- Period counters for fee-share caps (earnings paid + round-trips). Decimal
-- strings on earnings; never invents a rate.
CREATE TABLE IF NOT EXISTS "trade"."copy_period_stats" (
  "pair_key"            text PRIMARY KEY,
  "earnings_paid"       numeric(38, 18) NOT NULL DEFAULT 0,
  "round_trips"         integer NOT NULL DEFAULT 0,
  "updated_at"          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "copy_period_stats_nonneg_ck"
    CHECK ("earnings_paid" >= 0 AND "round_trips" >= 0)
);
