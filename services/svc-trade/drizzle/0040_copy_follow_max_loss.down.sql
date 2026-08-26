-- intafaced:destructive — reversal of 0040_copy_follow_max_loss.sql

ALTER TABLE "trade"."copy_follows"
  DROP CONSTRAINT IF EXISTS "copy_follows_max_loss_positive_ck";

ALTER TABLE "trade"."copy_follows"
  DROP COLUMN IF EXISTS "max_loss";
