-- trade.copy · one fill shares with at most one leader
-- Reversal: 0031_copy_settled_fee_shares_fill_unique.down.sql
--
-- PK was (follow_id, fill_id), so two follows could settle the same fill.
-- Sweep key is fill-only (`copy-fee:${fillId}`); a second leader payout
-- would drain the rewards pot. Unique fill_id is the durable once-key.

CREATE UNIQUE INDEX IF NOT EXISTS "copy_settled_fee_shares_fill_uidx"
  ON "trade"."copy_settled_fee_shares" ("fill_id");
