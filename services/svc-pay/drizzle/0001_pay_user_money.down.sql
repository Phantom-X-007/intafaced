-- intafaced:destructive — reversal of 0001_pay_user_money.sql
--
-- This drops the record of every user deposit and every user withdrawal.
--
-- The VALUE survives: it is in the ledger, and the ledger is the book. What does
-- not survive is the mapping from a ledger transaction back to the rail
-- reference it came from and the operator who credited it — and, for a
-- withdrawal, which client reference an in-flight hold belongs to. A withdrawal
-- sitting in `held` when this runs becomes a purpose-keyed hold account with
-- nothing left that knows what it was for.
--
-- It exists so the migration is provably reversible in CI against a scratch
-- schema (§14). It must NEVER run against a database with a withdrawal in
-- flight.

DROP TABLE IF EXISTS "pay"."withdrawals";
DROP TABLE IF EXISTS "pay"."deposits";

DROP TYPE IF EXISTS "pay"."withdrawal_status";
DROP TYPE IF EXISTS "pay"."deposit_status";
