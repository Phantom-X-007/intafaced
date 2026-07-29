-- intafaced:destructive — reversal of 0001_pool_reserves.sql
--
-- Exists so the migration is provably reversible in CI against a scratch schema
-- (§14), and so `pnpm --filter @intafaced/svc-indexer db:migrate -- --down`
-- followed by a fresh up is a real round trip rather than a claim.
--
-- This reversal strands nothing. Every row in this table is a copy of an AMM
-- pool's reserves at a block, rebuilt by re-indexing from the chain — the chain
-- is the record and this database is a cache of it. Unlike the ledger's
-- reversal, there is no audit trail here that exists nowhere else, and no
-- balance: no user's funds are represented by any row that this drops.

DROP TABLE IF EXISTS "indexer"."pool_reserves";
