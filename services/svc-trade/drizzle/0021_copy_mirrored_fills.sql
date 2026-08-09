-- trade.copy · durable mirror fill claims (Stage residual for product mount)
-- Reversal: 0021_copy_mirrored_fills.down.sql
--
-- SqlCopyFollowStore claims each leader fillId once per follow so a redelivered
-- observation cannot double-bump exposure. Table was referenced in code since
-- #1199; migration lands with the product mount so Sql store can boot on real DB.
-- Never stores rates, P&L, or invented §8 numbers.

CREATE TABLE IF NOT EXISTS "trade"."copy_mirrored_fills" (
  "follow_id"      text NOT NULL,
  "fill_id"        text NOT NULL,
  "follower_id"    text NOT NULL,
  "leader_id"      text NOT NULL,
  "market_id"      text NOT NULL,
  "side"           text NOT NULL,
  "qty"            numeric(38, 18) NOT NULL,
  "notional"       numeric(38, 18) NOT NULL,
  "next_exposure"  numeric(38, 18) NOT NULL,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("follow_id", "fill_id"),
  CONSTRAINT "copy_mirrored_fills_side_ck"
    CHECK ("side" IN ('buy', 'sell')),
  CONSTRAINT "copy_mirrored_fills_amounts_ck"
    CHECK ("qty" > 0 AND "notional" > 0 AND "next_exposure" >= 0)
);

CREATE INDEX IF NOT EXISTS "copy_mirrored_fills_follower_idx"
  ON "trade"."copy_mirrored_fills" ("follower_id");

CREATE INDEX IF NOT EXISTS "copy_mirrored_fills_leader_idx"
  ON "trade"."copy_mirrored_fills" ("leader_id");
