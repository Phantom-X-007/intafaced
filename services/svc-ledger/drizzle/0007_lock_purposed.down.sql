-- intafaced:destructive — removes accounts_lock_purposed_ck and restores 0001's
-- narrower accounts_hold_purposed_ck. This one IS a loosening: escrow, stake and
-- collateral may go unpurposed again. Declared for exactly that reason.
-- Reverses 0007_lock_purposed.sql
--
-- Restores 0001's narrower constraint exactly: `hold` must name its claim,
-- `escrow`, `stake` and `collateral` need not. That re-opens the case
-- `accounts.ts` describes — releasing loan A's collateral handing back value
-- that was securing loan B, with both postings balancing and the journal
-- reconciling. Reversible does not mean harmless.
--
-- STEP 1 of the forward migration raises rather than writing, so it has nothing
-- to reverse: no account, purpose or balance was changed in either direction.
--
-- The client keeps requiring a purpose on all four kinds regardless — reversing
-- this removes the backstop, not the rule.

ALTER TABLE "ledger"."accounts" DROP CONSTRAINT IF EXISTS "accounts_lock_purposed_ck";
ALTER TABLE "ledger"."accounts" DROP CONSTRAINT IF EXISTS "accounts_hold_purposed_ck";
ALTER TABLE "ledger"."accounts"
  ADD CONSTRAINT "accounts_hold_purposed_ck"
  CHECK ("kind" <> 'hold' OR length("purpose") > 0);
