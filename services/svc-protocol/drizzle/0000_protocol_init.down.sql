-- intafaced:destructive — reversal of 0000_protocol_init.sql
--
-- This drops the account read model. It exists so the migration is provably
-- reversible in CI against a scratch schema (§14).
--
-- Unlike the ledger's reversal, this one strands nothing: every row in these
-- tables is derived from chain state and can be rebuilt by re-indexing. The
-- user's funds are at an address derived from their own key and are not
-- reachable from, or affected by, anything in this database.

DROP TABLE IF EXISTS "protocol"."session_keys";
DROP TABLE IF EXISTS "protocol"."smart_accounts";
