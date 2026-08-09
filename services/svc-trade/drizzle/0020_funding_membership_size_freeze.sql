-- trade.futures · freeze funding period SIZE/notional with membership (W8)
-- Reversal: 0020_funding_membership_size_freeze.down.sql
--
-- THE DEFECT
--
-- 0019 freezes position *ids* for a periodId so a mid-gap opener cannot mint a
-- new (period, payer, payee) ledger key. Replays still re-read *live* size and
-- entry from open rows, so a partial close (or size increase) between post and
-- settle re-plans different amounts under the same keys. Ledger keeps the first
-- post; margin claim applies the re-planned net → ledger ≠ margin_current.
--
-- THE FIX
--
-- First freeze also stores a full snapshot per member (size, entry, side, user,
-- margin asset). Replays plan only from that snapshot — never open-now size.
-- No owner rate/cadence number invented; period identity unchanged.

ALTER TABLE "trade"."funding_period_membership"
  ADD COLUMN IF NOT EXISTS "member_snapshots" jsonb;

COMMENT ON COLUMN "trade"."funding_period_membership"."member_snapshots" IS
  'Frozen open-position snapshots at first plan: [{positionId,userId,side,size,entryPrice,marginAsset}]. Null only on pre-0020 rows.';
