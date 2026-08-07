-- trade.futures · current margin tracks funding (mega-audit Tier 1 #3)
-- Reversal: 0013_position_margin_current.down.sql
--
-- THE DEFECT
--
-- Funding posts debit position collateral on the ledger, but planners read
-- margin_initial which never moved. After any funding period, close/liquidation
-- over-released and overdrew the pot.
--
-- THE FIX
--
-- margin_current starts equal to margin_initial at open and is reduced when the
-- position pays funding. margin_initial stays the open-time record (immutable).
-- Planners and loaders use margin_current for residual release.

ALTER TABLE "trade"."positions"
  ADD COLUMN IF NOT EXISTS "margin_current" numeric(38, 18);

-- Backfill existing open/closed rows from the open-time figure.
UPDATE "trade"."positions"
   SET "margin_current" = "margin_initial"
 WHERE "margin_current" IS NULL;

ALTER TABLE "trade"."positions"
  ALTER COLUMN "margin_current" SET NOT NULL;

ALTER TABLE "trade"."positions"
  DROP CONSTRAINT IF EXISTS "positions_margin_current_ck";
ALTER TABLE "trade"."positions"
  ADD CONSTRAINT "positions_margin_current_ck" CHECK ("margin_current" >= 0);
