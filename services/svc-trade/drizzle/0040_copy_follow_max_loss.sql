-- trade.copy · independent follower max_loss (PTX-M26-R02)
-- Reversal: 0040_copy_follow_max_loss.down.sql
--
-- Follower loss cap is independent of leader recommendations. NULL means the
-- loss axis is unset; bind refuses when a leader maxLoss is supplied against
-- a missing follower cap. Never invents a default magnitude.

ALTER TABLE "trade"."copy_follows"
  ADD COLUMN IF NOT EXISTS "max_loss" numeric(38, 18);

ALTER TABLE "trade"."copy_follows"
  DROP CONSTRAINT IF EXISTS "copy_follows_max_loss_positive_ck";

ALTER TABLE "trade"."copy_follows"
  ADD CONSTRAINT "copy_follows_max_loss_positive_ck"
  CHECK ("max_loss" IS NULL OR "max_loss" > 0);
