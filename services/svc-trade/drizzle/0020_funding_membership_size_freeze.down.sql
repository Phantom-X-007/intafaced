-- intafaced:destructive — reversal of 0020_funding_membership_size_freeze.sql
ALTER TABLE "trade"."funding_period_membership"
  DROP COLUMN IF EXISTS "member_snapshots";
