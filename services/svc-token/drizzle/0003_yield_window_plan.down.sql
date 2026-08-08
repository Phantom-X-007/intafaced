-- Reverse of 0003.
--
-- intafaced:destructive drops "token"."yield_payouts", which is the record of
-- which stakers a yield window was planned to pay and which of those posts have
-- returned. The VALUE is not here and never was — every payout is a ledger
-- transaction, and the ledger is the audit trail. What is lost is the frozen
-- recipient list, which means reversing this migration also restores the defect
-- 0003 exists to fix: a re-run recomputes the list from today's stakers and pays
-- a newcomer out of a window that has already been distributed in full. A
-- rollback of last resort.

DROP INDEX IF EXISTS "token"."yield_payouts_unpaid_idx";

ALTER TABLE "token"."yield_payouts" DROP CONSTRAINT IF EXISTS "yield_payouts_paid_has_tx_ck";
ALTER TABLE "token"."yield_payouts" DROP CONSTRAINT IF EXISTS "yield_payouts_amount_positive_ck";

DROP TABLE IF EXISTS "token"."yield_payouts";
