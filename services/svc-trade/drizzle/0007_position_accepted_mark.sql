-- trade.futures · the mark a position was last accepted against
-- Reversal: 0007_position_accepted_mark.down.sql
--
-- THE DEVIATION BREAKER'S BASIS, AND NOTHING ELSE.
--
-- `mark-policy.ts`'s `acceptableForLiquidation` refuses a mark that has moved
-- more than `maxDeviationBps` from the previous mark this position was accepted
-- against. It was correct and it was never armed, because nothing anywhere
-- remembered a previous mark: every production call site passed `null`, and a
-- `null` previous skips the breaker. A feed that jumped 100x paid out on the
-- new mark and nothing refused.
--
-- These two columns are that memory. They are NOT a price feed, NOT a balance,
-- and NOT reachable by a caller: svc-trade writes them itself, only after a
-- mark it read from the mark port has already cleared a gate, and only inside
-- the same transaction as the operation that accepted it — so a REFUSED close
-- rolls the basis back with it and cannot be used to ratchet the breaker along.
--
-- NULL means "no mark has ever been accepted for this position": a first
-- valuation, which cannot deviate from anything. Deliberately NULL and not `0`
-- — a zero basis would make every later mark an infinite deviation, and this
-- path has already decided once that a missing price is not a zero price.

ALTER TABLE "trade"."positions"
  ADD COLUMN IF NOT EXISTS "accepted_mark"    numeric(38, 18),
  ADD COLUMN IF NOT EXISTS "accepted_mark_at" timestamptz;

DO $$ BEGIN
  ALTER TABLE "trade"."positions"
    ADD CONSTRAINT "positions_accepted_mark_positive_ck"
    CHECK ("accepted_mark" IS NULL OR "accepted_mark" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
