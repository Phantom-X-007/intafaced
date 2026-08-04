-- intafaced:destructive — reversal of 0001_p2p_payment_instruments.sql
--
-- This drops every seller's payment destination, every trade's frozen snapshot
-- of where the buyer was told to pay, and the entire access log.
--
-- It exists so the migration is provably reversible in CI against a scratch
-- schema (§14 DoD 1). Running it anywhere real has two distinct consequences,
-- and the second is the one people forget:
--
--   1. Every live trade loses its payment destination. Escrow is unaffected
--      (it is in svc-ledger), but no buyer can pay and every open trade will
--      time out into a refund or a dispute.
--   2. **The access log is gone.** It is the only record of who looked at whose
--      account details. It is append-only precisely so it cannot be edited away
--      one row at a time; dropping the table does the same thing in one
--      statement, and the answer to "who saw this" becomes permanently "we
--      cannot say".
--
-- Before running this anywhere real: `p2p.p2p_trades` must contain no row with
-- `resolution IS NULL`, and the access log must have been exported.
--
-- Order matters: the log and the snapshots reference `payment_instruments`.

DROP TRIGGER IF EXISTS "instrument_access_log_append_only" ON "p2p"."instrument_access_log";
DROP FUNCTION IF EXISTS "p2p"."instrument_access_log_is_append_only"();

DROP TABLE IF EXISTS "p2p"."instrument_access_log";
DROP TABLE IF EXISTS "p2p"."trade_payment_instruments";
DROP TABLE IF EXISTS "p2p"."payment_instruments";
DROP TABLE IF EXISTS "p2p"."payment_method_schemas";

-- After the table, because the constraint on it depends on this.
DROP FUNCTION IF EXISTS "p2p"."payment_method_fields_are_well_formed"(jsonb);
