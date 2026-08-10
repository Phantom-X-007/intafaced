-- trade.copy · durable fee-share settle claims (wave 13 L10 Class M)
-- Reversal: 0022_copy_settled_fee_shares.down.sql
--
-- SqlCopyFollowStore claims each follower fillId once per follow so a redelivered
-- settleFeeShare cannot re-run reserveEarnings (period earningsPaid / roundTrips
-- poison). Mirror path already claims fillId (#1199 / 0021); settle only had
-- ledger keys before this table — reserve runs *before* the post.
-- Never stores rates, P&L, or invented §8 numbers.

CREATE TABLE IF NOT EXISTS "trade"."copy_settled_fee_shares" (
  "follow_id"            text NOT NULL,
  "fill_id"              text NOT NULL,
  "leader_id"            text NOT NULL,
  "follower_id"          text NOT NULL,
  "asset_id"             text NOT NULL,
  "protocol_fee"         numeric(38, 18) NOT NULL,
  "applied_share_bps"    integer NOT NULL,
  "gross_leader_share"   numeric(38, 18) NOT NULL,
  "capped_leader_share"  numeric(38, 18) NOT NULL,
  "skipped_reason"       text,
  "settled"              boolean NOT NULL,
  "created_at"           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("follow_id", "fill_id"),
  CONSTRAINT "copy_settled_fee_shares_skip_ck"
    CHECK ("skipped_reason" IS NULL OR "skipped_reason" IN ('cap_reached', 'zero_share')),
  CONSTRAINT "copy_settled_fee_shares_amounts_ck"
    CHECK (
      "protocol_fee" >= 0
      AND "gross_leader_share" >= 0
      AND "capped_leader_share" >= 0
      AND "applied_share_bps" >= 0
      AND "applied_share_bps" <= 10000
    )
);

CREATE INDEX IF NOT EXISTS "copy_settled_fee_shares_follower_idx"
  ON "trade"."copy_settled_fee_shares" ("follower_id");

CREATE INDEX IF NOT EXISTS "copy_settled_fee_shares_leader_idx"
  ON "trade"."copy_settled_fee_shares" ("leader_id");
