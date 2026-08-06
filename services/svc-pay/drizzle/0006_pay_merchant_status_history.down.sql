-- intafaced:destructive — reversal of 0006_pay_merchant_status_history.sql
--
-- This drops the only record of why any merchant was ever suspended or
-- reinstated, and who did it. `merchants.status` survives, so the platform would
-- still refuse a suspended merchant's payments and still be unable to say why —
-- which is precisely the state the forward migration exists to end.
--
-- It exists so the migration is provably reversible in CI against a scratch
-- schema (§14). Running it against a database with real merchants destroys audit
-- evidence that is not recoverable from anywhere else: the ledger holds the
-- money, not the reasons.

DROP TRIGGER IF EXISTS "merchant_status_events_append_only_trg" ON "pay"."merchant_status_events";
DROP TABLE IF EXISTS "pay"."merchant_status_events";
DROP FUNCTION IF EXISTS "pay"."merchant_status_events_append_only"();
