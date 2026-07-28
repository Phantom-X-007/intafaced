-- svc-indexer · initial schema (§17.5 "Chain → Postgres read models")
-- Reversal: 0000_indexer_init.down.sql
--
-- The "indexer" schema itself is created by the database bootstrap
-- (tooling/infra/postgres-init/01-service-schemas.sql), which grants it to the
-- svc_indexer role. Migrations run as that role and hold no database-level
-- CREATE, so a migration cannot reach outside its own schema (§2).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EVERYTHING HERE IS A PROJECTION. The chain is the record.
--
-- There is no balance column and no running total anywhere in this schema. A
-- position row is a mirror of contract state at a block; it is not an amount
-- this service holds, owes, or can move. Doctrine §0.6 and §16.9: no module
-- holds its own balance, and on this plane no module holds anything at all.
--
-- Every table can be dropped and rebuilt by re-reading the chain. That is the
-- property that makes the reversal below safe, and it is the property the
-- reorg design leans on.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHY THE TABLES ARE SHAPED LIKE THIS — the reorg argument, in one place.
--
-- Chain data is not final on arrival. A projection that applies blocks as they
-- come and keeps only "the current value" cannot undo a block, because the
-- value it overwrote is gone. After a reorg it serves a price that was never on
-- the canonical chain, and nothing about it looks broken.
--
-- Confirmation depth is the usual answer and it is not sufficient: it lowers
-- the PROBABILITY of projecting a doomed block and makes the read model N
-- blocks stale, and any depth is still wrong for a reorg deeper than N.
--
-- So the state tables are VERSIONED BY BLOCK HEIGHT. `book_levels` and
-- `positions` are keyed on (…, block_height), one row per block that wrote that
-- key, and "current" is the newest version. Unwinding a reorg is then a DELETE
-- of the rows above the fork point: the previous version becomes current again
-- automatically, with no replay and no compensating writes to get wrong.
--
-- Confirmation depth survives as what it actually is — a pruning threshold and
-- a confidence signal on reads — not as the correctness mechanism.
--
-- The cost is version rows. `prune()` collapses every key to its newest version
-- at or below the finalised height, so retained history is bounded by the
-- reorg depth we are willing to repair rather than by chain age.

-- ── The chain of record ─────────────────────────────────────────────────────
--
-- Provenance for every projected row, and the only thing that can answer "is
-- the block that wrote this row still on the canonical chain?".
--
-- Orphaned blocks are KEPT, not deleted. A projection that silently forgets it
-- ever served a price cannot explain, afterwards, what a user saw.
CREATE TABLE IF NOT EXISTS "indexer"."blocks" (
  "chain_id"    integer     NOT NULL,
  "hash"        text        NOT NULL,
  "parent_hash" text        NOT NULL,
  "height"      bigint      NOT NULL,
  "status"      text        NOT NULL DEFAULT 'canonical',
  -- The block's own timestamp, from the chain. Not when we saw it.
  "block_time"  timestamptz NOT NULL,
  "observed_at" timestamptz NOT NULL DEFAULT now(),
  -- How many events this block contributed. Lets an operator tell "no activity"
  -- apart from "we failed to read it" without re-reading the chain.
  "event_count" integer     NOT NULL DEFAULT 0,

  PRIMARY KEY ("chain_id", "hash"),
  CONSTRAINT "blocks_hash_ck"        CHECK ("hash" ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT "blocks_parent_hash_ck" CHECK ("parent_hash" ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT "blocks_height_ck"      CHECK ("height" >= 0),
  CONSTRAINT "blocks_status_ck"      CHECK ("status" IN ('canonical', 'orphaned'))
);

-- THE INVARIANT THAT MATTERS, held by the database rather than by our code:
-- there is at most one canonical block at a height. A projection with two
-- canonical blocks at one height has two answers for every read below it, and
-- a bug that produces one is otherwise invisible until a user sees the wrong
-- price. A partial index makes it unrepresentable.
CREATE UNIQUE INDEX IF NOT EXISTS "blocks_canonical_height_idx"
  ON "indexer"."blocks" ("chain_id", "height")
  WHERE "status" = 'canonical';

CREATE INDEX IF NOT EXISTS "blocks_height_idx"
  ON "indexer"."blocks" ("chain_id", "height" DESC);

-- ── Order book levels ───────────────────────────────────────────────────────
--
-- One row per (market, side, price) PER BLOCK that changed it. The newest
-- version at or below the canonical head is the live level.
--
-- Quantity is ABSOLUTE — the total resting at that price after the block, never
-- a change to it. Same reasoning as packages/market-data's depth deltas, and
-- here it buys something extra: re-applying a block is a no-op by construction,
-- so idempotency is a property of the key rather than a check someone can skip.
-- A relative delta applied twice corrupts the level and no primary key can
-- catch it.
--
-- Quantity 0 means the level is EMPTY, and the row is kept rather than deleted:
-- "no depth at this price as of block N" is a fact the projection has to be
-- able to state, and it is also the version an unwind may need to fall back to.
CREATE TABLE IF NOT EXISTS "indexer"."book_levels" (
  "chain_id"     integer        NOT NULL,
  "market"       text           NOT NULL,
  "side"         text           NOT NULL,
  -- Money is numeric, never a float. numeric equality is by VALUE, so 100 and
  -- 100.0 are one key — which is what a price level means.
  "price"        numeric(38,18) NOT NULL,
  "block_height" bigint         NOT NULL,
  "block_hash"   text           NOT NULL,
  "quantity"     numeric(38,18) NOT NULL,

  PRIMARY KEY ("chain_id", "market", "side", "price", "block_height"),
  CONSTRAINT "book_levels_side_ck"     CHECK ("side" IN ('bid', 'ask')),
  CONSTRAINT "book_levels_price_ck"    CHECK ("price" > 0),
  CONSTRAINT "book_levels_quantity_ck" CHECK ("quantity" >= 0)
);

-- Serves the DISTINCT ON that resolves each price to its newest version.
CREATE INDEX IF NOT EXISTS "book_levels_current_idx"
  ON "indexer"."book_levels" ("chain_id", "market", "side", "price", "block_height" DESC);

-- Serves the unwind (delete everything above the fork) and the prune.
CREATE INDEX IF NOT EXISTS "book_levels_height_idx"
  ON "indexer"."book_levels" ("chain_id", "block_height");

-- ── Fills ───────────────────────────────────────────────────────────────────
--
-- Events, not state, so these are append-only and never versioned.
--
-- The primary key is the chain's own natural identity for a log: the block that
-- contained it plus its index within that block. THAT is what makes
-- re-processing safe — a re-read of the same block collides on the same key and
-- inserts nothing. Note it keys on block HASH, not height: two competing blocks
-- at the same height are different blocks and their fills must not collide.
CREATE TABLE IF NOT EXISTS "indexer"."fills" (
  "chain_id"     integer        NOT NULL,
  "block_hash"   text           NOT NULL,
  "log_index"    integer        NOT NULL,
  "block_height" bigint         NOT NULL,
  "market"       text           NOT NULL,
  "price"        numeric(38,18) NOT NULL,
  "quantity"     numeric(38,18) NOT NULL,
  -- Which side crossed the spread. Drives the trade tape's colour and the
  -- direction of any statistic computed from it.
  "taker_side"   text           NOT NULL,
  "maker"        text           NOT NULL,
  "taker"        text           NOT NULL,
  "block_time"   timestamptz    NOT NULL,

  PRIMARY KEY ("chain_id", "block_hash", "log_index"),
  CONSTRAINT "fills_taker_side_ck" CHECK ("taker_side" IN ('buy', 'sell')),
  CONSTRAINT "fills_price_ck"      CHECK ("price" > 0),
  CONSTRAINT "fills_quantity_ck"   CHECK ("quantity" > 0),
  CONSTRAINT "fills_maker_ck"      CHECK ("maker" ~ '^0x[0-9a-fA-F]{40}$'),
  CONSTRAINT "fills_taker_ck"      CHECK ("taker" ~ '^0x[0-9a-fA-F]{40}$')
);

CREATE INDEX IF NOT EXISTS "fills_market_idx"
  ON "indexer"."fills" ("chain_id", "market", "block_height" DESC, "log_index" DESC);

CREATE INDEX IF NOT EXISTS "fills_height_idx"
  ON "indexer"."fills" ("chain_id", "block_height");

-- An account's own tape. Two indexes rather than one on (maker, taker) because
-- a fill has two parties and either may be the one asking.
CREATE INDEX IF NOT EXISTS "fills_maker_idx"
  ON "indexer"."fills" ("chain_id", "maker", "block_height" DESC);

CREATE INDEX IF NOT EXISTS "fills_taker_idx"
  ON "indexer"."fills" ("chain_id", "taker", "block_height" DESC);

-- ── Positions ───────────────────────────────────────────────────────────────
--
-- Contract state, mirrored per block, versioned exactly like book levels.
--
-- `size` is SIGNED — negative is short — and it is a mirror of a number held in
-- a contract, at an address derived from the user's own key. It is not a
-- balance this service holds. There is no code path in this service that can
-- change the number this row copies.
--
-- The absolute-state rule applies here too, and matters more: a position
-- projected by accumulating fills would need its own dedupe log to survive a
-- replay, and would need signed compensating entries to survive a reorg. Both
-- are things that can be got wrong. Copying state cannot be.
CREATE TABLE IF NOT EXISTS "indexer"."positions" (
  "chain_id"     integer        NOT NULL,
  "market"       text           NOT NULL,
  "account"      text           NOT NULL,
  "block_height" bigint         NOT NULL,
  "block_hash"   text           NOT NULL,
  "size"         numeric(38,18) NOT NULL,
  -- Volume-weighted average entry, as the contract reports it. Zero when flat.
  "entry_price"  numeric(38,18) NOT NULL,

  PRIMARY KEY ("chain_id", "market", "account", "block_height"),
  CONSTRAINT "positions_account_ck"     CHECK ("account" ~ '^0x[0-9a-fA-F]{40}$'),
  CONSTRAINT "positions_entry_price_ck" CHECK ("entry_price" >= 0)
);

CREATE INDEX IF NOT EXISTS "positions_current_idx"
  ON "indexer"."positions" ("chain_id", "market", "account", "block_height" DESC);

CREATE INDEX IF NOT EXISTS "positions_account_idx"
  ON "indexer"."positions" ("chain_id", "account", "block_height" DESC);

CREATE INDEX IF NOT EXISTS "positions_height_idx"
  ON "indexer"."positions" ("chain_id", "block_height");
