-- svc-indexer · AMM pool reserves (§8.6 "internal book vs. pool quote")
-- Reversal: 0001_pool_reserves.down.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS TABLE EXISTS
--
-- svc-protocol's `protocol.amm.quoteExactIn` is constant-product arithmetic
-- that takes `reserveIn` / `reserveOut` as INPUT. Nothing in the platform
-- produced them, so the AMM was a calculator with no inputs — the same shape
-- `dex.quote` was in before it was given real venues. A quote path wired to it
-- would have had to invent the reserves, and an invented price in a trading
-- product is worse than an outage: an outage stops a user, an invented number
-- encourages one.
--
-- This is the projection that makes that wiring honest. It is still a
-- PROJECTION — every row is a copy of public chain state, there is no balance
-- and no running total here, and the whole table can be dropped and rebuilt by
-- re-reading the chain (Doctrine §0.6, §16.9).
-- ─────────────────────────────────────────────────────────────────────────────
--
-- VERSIONED BY BLOCK HEIGHT, exactly like `book_levels` and `positions`, and
-- for exactly the same reason — see 0000_indexer_init.sql for the argument in
-- full. One row per (pool, block) that changed it; "current" is the newest
-- version; a reorg is repaired by DELETEing the versions above the fork, so the
-- previous reserve pair becomes current again by itself.
--
-- It matters more here than anywhere else in this schema. A stale order book
-- shows thin depth and a user sees that. A stale RESERVE PAIR produces a
-- confident, plausible, wrong price with no visible symptom at all.

CREATE TABLE IF NOT EXISTS "indexer"."pool_reserves" (
  "chain_id"     integer        NOT NULL,
  -- The pool CONTRACT is the identity, not the market symbol. One symbol can be
  -- served by several pools at different fee tiers, and keying on the symbol
  -- would make them overwrite each other — silently collapsing a fee tier into
  -- whichever pool the adapter happened to read last.
  "pool"         text           NOT NULL,
  "block_height" bigint         NOT NULL,
  "block_hash"   text           NOT NULL,

  -- The symbol this pool prices. An adapter-assigned label, like `market`
  -- elsewhere in this schema — the chain knows addresses, not tickers.
  "market"       text           NOT NULL,

  "token0"       text           NOT NULL,
  "token1"       text           NOT NULL,

  -- Token decimals, carried so the RAW uint256 the pool contract holds can be
  -- reconstructed exactly: raw = reserve / 10^(18 - decimals). Constant-product
  -- math is scale-homogeneous, so quoting on these 18dp values is correct; but
  -- for a token with fewer than 18 decimals the floor division lands on a finer
  -- grid than the chain's, so a consumer that needs the value the contract will
  -- actually pay — to the last raw unit — converts back first.
  "decimals0"    smallint       NOT NULL,
  "decimals1"    smallint       NOT NULL,

  -- MONEY. numeric(38,18), never a float, never raw wei.
  --
  -- Human units rather than raw wei is a storage decision with a reason:
  -- numeric(38,18) leaves twenty digits before the point, and an 18-decimal
  -- token with a large supply overflows that in raw units while fitting
  -- comfortably in human ones.
  --
  -- Zero is LEGAL and meaningful: a pool created but never seeded, or fully
  -- burned, really does hold nothing. That is a fact the chain stated, and it
  -- is not the same as "we have no row", which the read path refuses outright.
  "reserve0"     numeric(38,18) NOT NULL,
  "reserve1"     numeric(38,18) NOT NULL,

  -- ORIENTATION, carried rather than guessed.
  --
  -- A pool orders its tokens by address (token0 < token1); a market symbol
  -- orders them by meaning (IFC-USD is IFC priced in USD). Those two orderings
  -- agree by coincidence about half the time. Getting it backwards INVERTS the
  -- price and produces a number that looks entirely plausible, so which token
  -- is the base is stored as a fact rather than derived from a convention.
  "base_token"   text           NOT NULL,

  -- Swap fee in basis points, as the pool reports it. Not money: a small
  -- integer protocol parameter, the same way svc-protocol models `feeBps`.
  "fee_bps"      integer        NOT NULL,

  -- THE TWO CLOCKS, and they answer different questions.
  --
  -- `block_time` is the chain's own timestamp on the block that wrote this row.
  -- It is what measures how far behind the CHAIN a reserve is — a projection
  -- that is up, unhalted and twenty blocks behind looks perfectly healthy
  -- without it.
  --
  -- `observed_at` is OUR clock, when this projection recorded the row. A chain
  -- source that has silently stopped updating still answers and still looks
  -- healthy; only our own clock at the moment of the write catches that. It is
  -- never refreshed by a re-apply of the same block, so it stays a true
  -- statement about when this value first entered the projection.
  "block_time"   timestamptz    NOT NULL,
  "observed_at"  timestamptz    NOT NULL DEFAULT now(),

  PRIMARY KEY ("chain_id", "pool", "block_height"),

  CONSTRAINT "pool_reserves_pool_ck"      CHECK ("pool" ~ '^0x[0-9a-fA-F]{40}$'),
  CONSTRAINT "pool_reserves_token0_ck"    CHECK ("token0" ~ '^0x[0-9a-fA-F]{40}$'),
  CONSTRAINT "pool_reserves_token1_ck"    CHECK ("token1" ~ '^0x[0-9a-fA-F]{40}$'),
  CONSTRAINT "pool_reserves_base_fmt_ck"  CHECK ("base_token" ~ '^0x[0-9a-fA-F]{40}$'),
  -- A pool of a token against itself has no price, and its reserve pair would
  -- be one number counted twice.
  CONSTRAINT "pool_reserves_distinct_ck"  CHECK (lower("token0") <> lower("token1")),
  -- The orientation invariant, held by the database. A base token outside the
  -- pair inverts every price derived from the row, and nothing downstream can
  -- detect that from the numbers alone.
  CONSTRAINT "pool_reserves_base_ck"      CHECK (lower("base_token") IN (lower("token0"), lower("token1"))),
  CONSTRAINT "pool_reserves_decimals0_ck" CHECK ("decimals0" BETWEEN 0 AND 18),
  CONSTRAINT "pool_reserves_decimals1_ck" CHECK ("decimals1" BETWEEN 0 AND 18),
  CONSTRAINT "pool_reserves_reserve0_ck"  CHECK ("reserve0" >= 0),
  CONSTRAINT "pool_reserves_reserve1_ck"  CHECK ("reserve1" >= 0),
  -- Matches svc-protocol's AMM math, which refuses anything above 1000 bps
  -- (`amm.bad_fee`). Storing a fee our own quote math would reject would mean
  -- projecting a pool nothing can ever price, and the failure would surface
  -- from the quote path with no clue that the reserve row was the problem.
  CONSTRAINT "pool_reserves_fee_ck"       CHECK ("fee_bps" BETWEEN 0 AND 1000)
);

-- Serves the DISTINCT ON that resolves each pool to its newest version.
CREATE INDEX IF NOT EXISTS "pool_reserves_current_idx"
  ON "indexer"."pool_reserves" ("chain_id", "pool", "block_height" DESC);

-- Serves "every pool for this symbol", which is the read a quote path makes.
CREATE INDEX IF NOT EXISTS "pool_reserves_market_idx"
  ON "indexer"."pool_reserves" ("chain_id", "market", "pool", "block_height" DESC);

-- Serves the unwind (delete everything above the fork) and the prune.
CREATE INDEX IF NOT EXISTS "pool_reserves_height_idx"
  ON "indexer"."pool_reserves" ("chain_id", "block_height");
