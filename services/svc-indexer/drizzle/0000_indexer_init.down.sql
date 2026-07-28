-- intafaced:destructive — reversal of 0000_indexer_init.sql
--
-- Exists so the migration is provably reversible in CI against a scratch schema
-- (§14), and so `pnpm --filter @intafaced/svc-indexer db:migrate -- --down`
-- followed by a fresh up is a real round trip rather than a claim.
--
-- This reversal strands nothing. Every row in these tables is derived from
-- chain state and is rebuilt by re-indexing from genesis — the chain is the
-- record and this database is a cache of it. Unlike the ledger's reversal,
-- there is no audit trail here that exists nowhere else.
--
-- Dropped children-first so the drop order does not depend on CASCADE.

DROP TABLE IF EXISTS "indexer"."positions";
DROP TABLE IF EXISTS "indexer"."fills";
DROP TABLE IF EXISTS "indexer"."book_levels";
DROP TABLE IF EXISTS "indexer"."blocks";
