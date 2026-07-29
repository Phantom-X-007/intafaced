import type { Sql } from 'postgres';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client/money';
import {
  amountOf,
  assertValidBlock,
  nonNegativeAmountOf,
  positiveAmountOf,
  type BookSide,
  type ChainBlock,
  type TakerSide,
} from '../chain/source.js';
import type {
  ApplyOutcome,
  BookLevel,
  BookView,
  FillRecord,
  PoolReservesRecord,
  PositionRecord,
  ProjectionStore,
  StoredBlock,
  UnwindOutcome,
} from './store.js';

/**
 * Postgres-backed `ProjectionStore`.
 *
 * Table names are UNQUALIFIED on purpose. `createDb` sets `search_path` to the
 * service's own schema (§2 — a service sees only its own tables, enforced by
 * the role's grants), and the test harness sets it to a throwaway schema built
 * from these same migrations. Qualifying them would make the production SQL
 * untestable in isolation, which is how a schema and the code that reads it
 * drift apart.
 *
 * Numeric columns come back from `postgres` as decimal strings and `bigint`
 * columns as strings too. Both are converted at the edge of this file: money
 * through `parseAmount` into scaled bigint, heights through `Number` (a block
 * height is a small integer and stays one). Nothing downstream ever sees a
 * numeric that has been through a float.
 */
export class PostgresProjectionStore implements ProjectionStore {
  constructor(
    private readonly sql: Sql,
    readonly chainId: number,
  ) {}

  // ── Chain of record ───────────────────────────────────────────────────────

  async head(): Promise<StoredBlock | null> {
    const [row] = await this.sql<BlockRow[]>`
      SELECT chain_id, hash, parent_hash, height, status, block_time, event_count
      FROM blocks
      WHERE chain_id = ${this.chainId} AND status = 'canonical'
      ORDER BY height DESC
      LIMIT 1
    `;
    return row ? toStoredBlock(row) : null;
  }

  async blockAt(height: number): Promise<StoredBlock | null> {
    const [row] = await this.sql<BlockRow[]>`
      SELECT chain_id, hash, parent_hash, height, status, block_time, event_count
      FROM blocks
      WHERE chain_id = ${this.chainId} AND height = ${height} AND status = 'canonical'
    `;
    return row ? toStoredBlock(row) : null;
  }

  async earliestHeight(): Promise<number | null> {
    const [row] = await this.sql<Array<{ min: string | null }>>`
      SELECT MIN(height) AS min FROM blocks WHERE chain_id = ${this.chainId} AND status = 'canonical'
    `;
    return row?.min == null ? null : Number(row.min);
  }

  // ── Projection ────────────────────────────────────────────────────────────

  /**
   * One transaction for the block record and every event it carries.
   *
   * Read-committed (the default) rather than serializable: this store has a
   * single writer by construction — one ingest loop, advancing a cursor it owns
   * — so there is no read/write skew for serializable to detect, and the retry
   * machinery in `@intafaced/db` exists for contended money paths that this is
   * not. Atomicity is what is needed here, and atomicity is what a plain
   * transaction gives.
   */
  async applyBlock(block: ChainBlock): Promise<ApplyOutcome> {
    assertValidBlock(block);

    return this.sql.begin(async (tx) => {
      const [prior] = await tx<Array<{ status: string }>>`
        SELECT status FROM blocks WHERE chain_id = ${this.chainId} AND hash = ${block.hash}
      `;
      const duplicate = prior?.status === 'canonical';

      const blockTime = new Date(block.timestamp * 1000);

      // A block whose hash we already orphaned comes back canonical here — a
      // chain that reorgs away and then back is ordinary, and a projection that
      // could not follow it home would be stuck serving the loser.
      //
      // The partial unique index on (chain_id, height) WHERE canonical means
      // this INSERT is what refuses a second canonical block at one height. The
      // database holds that invariant, not this code path.
      await tx`
        INSERT INTO blocks (chain_id, hash, parent_hash, height, status, block_time, event_count)
        VALUES (${this.chainId}, ${block.hash}, ${block.parentHash}, ${block.height}, 'canonical', ${blockTime}, ${block.events.length})
        ON CONFLICT (chain_id, hash) DO UPDATE
          SET status = 'canonical', event_count = EXCLUDED.event_count
      `;

      for (const event of block.events) {
        switch (event.kind) {
          case 'book_level': {
            const price = formatAmount(positiveAmountOf(event.price, 'book level price'));
            const quantity = formatAmount(nonNegativeAmountOf(event.quantity, 'book level quantity'));
            // ABSOLUTE quantity, so the conflict update is an assignment rather
            // than an accumulation. That is what makes re-processing a block a
            // no-op instead of a double count.
            await tx`
              INSERT INTO book_levels (chain_id, market, side, price, block_height, block_hash, quantity)
              VALUES (${this.chainId}, ${event.market}, ${event.side}, ${price}, ${block.height}, ${block.hash}, ${quantity})
              ON CONFLICT (chain_id, market, side, price, block_height) DO UPDATE
                SET quantity = EXCLUDED.quantity, block_hash = EXCLUDED.block_hash
            `;
            break;
          }

          case 'fill': {
            // (block hash, log index) is the chain's own identity for a log.
            // DO NOTHING here is THE anti-double-count guarantee for the tape:
            // a re-read of the same block inserts nothing at all.
            await tx`
              INSERT INTO fills (chain_id, block_hash, log_index, block_height, market, price, quantity, taker_side, maker, taker, block_time)
              VALUES (
                ${this.chainId}, ${block.hash}, ${event.logIndex}, ${block.height}, ${event.market},
                ${formatAmount(positiveAmountOf(event.price, 'fill price'))},
                ${formatAmount(positiveAmountOf(event.quantity, 'fill quantity'))},
                ${event.takerSide}, ${event.maker}, ${event.taker}, ${blockTime}
              )
              ON CONFLICT (chain_id, block_hash, log_index) DO NOTHING
            `;
            break;
          }

          case 'position': {
            await tx`
              INSERT INTO positions (chain_id, market, account, block_height, block_hash, size, entry_price)
              VALUES (
                ${this.chainId}, ${event.market}, ${event.account}, ${block.height}, ${block.hash},
                ${formatAmount(amountOf(event.size, 'position size'))},
                ${formatAmount(nonNegativeAmountOf(event.entryPrice, 'position entry price'))}
              )
              ON CONFLICT (chain_id, market, account, block_height) DO UPDATE
                SET size = EXCLUDED.size, entry_price = EXCLUDED.entry_price, block_hash = EXCLUDED.block_hash
            `;
            break;
          }

          case 'pool_reserves': {
            // ABSOLUTE reserves, so the conflict update is an assignment — the
            // same rule as a book level, and the reason re-applying a block is
            // a no-op instead of a double count.
            //
            // `observed_at` is NOT in the update list, deliberately. It records
            // when this value first entered the projection; a re-apply of the
            // same block is not a new observation, and refreshing it there
            // would make a replayed block look freshly read to every staleness
            // check downstream.
            await tx`
              INSERT INTO pool_reserves (
                chain_id, pool, block_height, block_hash, market,
                token0, token1, decimals0, decimals1, reserve0, reserve1,
                base_token, fee_bps, block_time
              )
              VALUES (
                ${this.chainId}, ${event.pool}, ${block.height}, ${block.hash}, ${event.market},
                ${event.token0}, ${event.token1}, ${event.decimals0}, ${event.decimals1},
                ${formatAmount(nonNegativeAmountOf(event.reserve0, 'pool reserve0'))},
                ${formatAmount(nonNegativeAmountOf(event.reserve1, 'pool reserve1'))},
                ${event.baseToken}, ${event.feeBps}, ${blockTime}
              )
              ON CONFLICT (chain_id, pool, block_height) DO UPDATE
                SET reserve0 = EXCLUDED.reserve0,
                    reserve1 = EXCLUDED.reserve1,
                    market = EXCLUDED.market,
                    token0 = EXCLUDED.token0,
                    token1 = EXCLUDED.token1,
                    decimals0 = EXCLUDED.decimals0,
                    decimals1 = EXCLUDED.decimals1,
                    base_token = EXCLUDED.base_token,
                    fee_bps = EXCLUDED.fee_bps,
                    block_hash = EXCLUDED.block_hash,
                    block_time = EXCLUDED.block_time
            `;
            break;
          }
        }
      }

      return { duplicate, eventsApplied: block.events.length };
    }) as Promise<ApplyOutcome>;
  }

  async unwindTo(height: number): Promise<UnwindOutcome> {
    return this.sql.begin(async (tx) => {
      const orphaned = await tx`
        UPDATE blocks SET status = 'orphaned'
        WHERE chain_id = ${this.chainId} AND height >= ${height} AND status = 'canonical'
      `;
      const levels = await tx`DELETE FROM book_levels WHERE chain_id = ${this.chainId} AND block_height >= ${height}`;
      const fills = await tx`DELETE FROM fills WHERE chain_id = ${this.chainId} AND block_height >= ${height}`;
      const positions = await tx`DELETE FROM positions WHERE chain_id = ${this.chainId} AND block_height >= ${height}`;
      const reserves = await tx`DELETE FROM pool_reserves WHERE chain_id = ${this.chainId} AND block_height >= ${height}`;

      return {
        blocksOrphaned: orphaned.count,
        bookLevelsRemoved: levels.count,
        fillsRemoved: fills.count,
        positionsRemoved: positions.count,
        poolReservesRemoved: reserves.count,
      };
    }) as Promise<UnwindOutcome>;
  }

  async prune(throughHeight: number): Promise<number> {
    return this.sql.begin(async (tx) => {
      // "Delete a version that a newer version at or below the horizon already
      // supersedes." The `<= throughHeight` on the inner query matters: without
      // it, a level written above the horizon would let this delete the last
      // version below it, and an unwind back past the horizon would then find
      // nothing to fall back to.
      const levels = await tx`
        DELETE FROM book_levels bl
        WHERE bl.chain_id = ${this.chainId}
          AND bl.block_height <= ${throughHeight}
          AND EXISTS (
            SELECT 1 FROM book_levels n
            WHERE n.chain_id = bl.chain_id AND n.market = bl.market AND n.side = bl.side
              AND n.price = bl.price
              AND n.block_height > bl.block_height AND n.block_height <= ${throughHeight}
          )
      `;

      const positions = await tx`
        DELETE FROM positions p
        WHERE p.chain_id = ${this.chainId}
          AND p.block_height <= ${throughHeight}
          AND EXISTS (
            SELECT 1 FROM positions n
            WHERE n.chain_id = p.chain_id AND n.market = p.market AND n.account = p.account
              AND n.block_height > p.block_height AND n.block_height <= ${throughHeight}
          )
      `;

      const reserves = await tx`
        DELETE FROM pool_reserves pr
        WHERE pr.chain_id = ${this.chainId}
          AND pr.block_height <= ${throughHeight}
          AND EXISTS (
            SELECT 1 FROM pool_reserves n
            WHERE n.chain_id = pr.chain_id AND n.pool = pr.pool
              AND n.block_height > pr.block_height AND n.block_height <= ${throughHeight}
          )
      `;

      const orphans = await tx`
        DELETE FROM blocks
        WHERE chain_id = ${this.chainId} AND status = 'orphaned' AND height <= ${throughHeight}
      `;

      return levels.count + positions.count + reserves.count + orphans.count;
    }) as Promise<number>;
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async book(market: string, depth: number): Promise<BookView> {
    const head = await this.head();
    const [bids, asks] = await Promise.all([this.#side(market, 'bid', depth), this.#side(market, 'ask', depth)]);
    return {
      market,
      chainId: this.chainId,
      asOfHeight: head?.height ?? null,
      asOfHash: head?.hash ?? null,
      bids,
      asks,
    };
  }

  /**
   * One side of the book: newest version per price, empty levels dropped.
   *
   * The `quantity > 0` filter sits OUTSIDE the `DISTINCT ON`, and that ordering
   * is the whole correctness of the query. Inside, it would skip the version
   * that emptied a level and fall back to the depth that level had in an
   * earlier block — resurrecting liquidity that is gone.
   */
  async #side(market: string, side: BookSide, depth: number): Promise<BookLevel[]> {
    const rows =
      side === 'bid'
        ? await this.sql<LevelRow[]>`
            SELECT price, quantity FROM (
              SELECT DISTINCT ON (price) price, quantity
              FROM book_levels
              WHERE chain_id = ${this.chainId} AND market = ${market} AND side = 'bid'
              ORDER BY price, block_height DESC
            ) current
            WHERE quantity > 0
            ORDER BY price DESC
            LIMIT ${depth}
          `
        : await this.sql<LevelRow[]>`
            SELECT price, quantity FROM (
              SELECT DISTINCT ON (price) price, quantity
              FROM book_levels
              WHERE chain_id = ${this.chainId} AND market = ${market} AND side = 'ask'
              ORDER BY price, block_height DESC
            ) current
            WHERE quantity > 0
            ORDER BY price ASC
            LIMIT ${depth}
          `;

    return rows.map((row) => ({ price: parseAmount(row.price), quantity: parseAmount(row.quantity) }));
  }

  async recentFills(market: string, limit: number): Promise<readonly FillRecord[]> {
    const rows = await this.sql<FillRow[]>`
      SELECT block_height, block_hash, log_index, market, price, quantity, taker_side, maker, taker, block_time
      FROM fills
      WHERE chain_id = ${this.chainId} AND market = ${market}
      ORDER BY block_height DESC, log_index DESC
      LIMIT ${limit}
    `;
    return rows.map(toFill);
  }

  async fillsForAccount(account: string, limit: number): Promise<readonly FillRecord[]> {
    const rows = await this.sql<FillRow[]>`
      SELECT block_height, block_hash, log_index, market, price, quantity, taker_side, maker, taker, block_time
      FROM fills
      WHERE chain_id = ${this.chainId} AND (lower(maker) = lower(${account}) OR lower(taker) = lower(${account}))
      ORDER BY block_height DESC, log_index DESC
      LIMIT ${limit}
    `;
    return rows.map(toFill);
  }

  async position(market: string, account: string): Promise<PositionRecord | null> {
    const [row] = await this.sql<PositionRow[]>`
      SELECT DISTINCT ON (market, account) market, account, size, entry_price, block_height, block_hash
      FROM positions
      WHERE chain_id = ${this.chainId} AND market = ${market} AND lower(account) = lower(${account})
      ORDER BY market, account, block_height DESC
    `;
    return row ? toPosition(row) : null;
  }

  async positionsOf(account: string): Promise<readonly PositionRecord[]> {
    const rows = await this.sql<PositionRow[]>`
      SELECT DISTINCT ON (market, account) market, account, size, entry_price, block_height, block_hash
      FROM positions
      WHERE chain_id = ${this.chainId} AND lower(account) = lower(${account})
      ORDER BY market, account, block_height DESC
    `;
    return rows.map(toPosition);
  }

  // ── Pool reserves ─────────────────────────────────────────────────────────
  //
  // `DISTINCT ON (pool)` resolves each pool to its newest version, exactly as
  // the book does per price. Note what is NOT filtered out afterwards: a pool
  // whose current reserves are zero is RETURNED. An empty pool is a real chain
  // state — created and never seeded, or fully burned — and dropping it here
  // would report "we have no data for this pool", which is a different and
  // much more dangerous sentence. The read path in `router.ts` is what turns
  // "nothing projected" into a refusal, and `quoteExactIn` already refuses a
  // zero reserve with `amm.no_liquidity`.

  async poolReservesFor(market: string): Promise<readonly PoolReservesRecord[]> {
    const rows = await this.sql<PoolReserveRow[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (pool)
          pool, market, token0, token1, decimals0, decimals1, reserve0, reserve1,
          base_token, fee_bps, block_height, block_hash, block_time, observed_at
        FROM pool_reserves
        WHERE chain_id = ${this.chainId} AND market = ${market}
        ORDER BY pool, block_height DESC
      ) current
      ORDER BY pool
    `;
    return rows.map(toPoolReserves);
  }

  async poolReserve(pool: string): Promise<PoolReservesRecord | null> {
    const [row] = await this.sql<PoolReserveRow[]>`
      SELECT DISTINCT ON (pool)
        pool, market, token0, token1, decimals0, decimals1, reserve0, reserve1,
        base_token, fee_bps, block_height, block_hash, block_time, observed_at
      FROM pool_reserves
      WHERE chain_id = ${this.chainId} AND lower(pool) = lower(${pool})
      ORDER BY pool, block_height DESC
    `;
    return row ? toPoolReserves(row) : null;
  }

  async pools(): Promise<readonly PoolReservesRecord[]> {
    const rows = await this.sql<PoolReserveRow[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (pool)
          pool, market, token0, token1, decimals0, decimals1, reserve0, reserve1,
          base_token, fee_bps, block_height, block_hash, block_time, observed_at
        FROM pool_reserves
        WHERE chain_id = ${this.chainId}
        ORDER BY pool, block_height DESC
      ) current
      ORDER BY market, pool
    `;
    return rows.map(toPoolReserves);
  }

  async markets(): Promise<readonly string[]> {
    const rows = await this.sql<Array<{ market: string }>>`
      SELECT market FROM book_levels WHERE chain_id = ${this.chainId}
      UNION
      SELECT market FROM fills WHERE chain_id = ${this.chainId}
      UNION
      SELECT market FROM positions WHERE chain_id = ${this.chainId}
      UNION
      SELECT market FROM pool_reserves WHERE chain_id = ${this.chainId}
      ORDER BY market
    `;
    return rows.map((r) => r.market);
  }
}

// ── Row shapes and conversions ──────────────────────────────────────────────

interface BlockRow {
  chain_id: number;
  hash: string;
  parent_hash: string;
  height: string;
  status: string;
  block_time: Date;
  event_count: number;
}

interface LevelRow {
  price: string;
  quantity: string;
}

interface FillRow {
  block_height: string;
  block_hash: string;
  log_index: number;
  market: string;
  price: string;
  quantity: string;
  taker_side: string;
  maker: string;
  taker: string;
  block_time: Date;
}

interface PositionRow {
  market: string;
  account: string;
  size: string;
  entry_price: string;
  block_height: string;
  block_hash: string;
}

interface PoolReserveRow {
  pool: string;
  market: string;
  token0: string;
  token1: string;
  /** `smallint` comes back as a JS number, which is what it is: a decimal count. */
  decimals0: number;
  decimals1: number;
  reserve0: string;
  reserve1: string;
  base_token: string;
  fee_bps: number;
  block_height: string;
  block_hash: string;
  block_time: Date;
  observed_at: Date;
}

function toStoredBlock(row: BlockRow): StoredBlock {
  return {
    chainId: row.chain_id,
    height: Number(row.height),
    hash: row.hash,
    parentHash: row.parent_hash,
    status: row.status === 'orphaned' ? 'orphaned' : 'canonical',
    blockTime: row.block_time,
    eventCount: row.event_count,
  };
}

function toFill(row: FillRow): FillRecord {
  return {
    blockHeight: Number(row.block_height),
    blockHash: row.block_hash,
    logIndex: row.log_index,
    market: row.market,
    price: parseAmount(row.price),
    quantity: parseAmount(row.quantity),
    takerSide: row.taker_side as TakerSide,
    maker: row.maker,
    taker: row.taker,
    blockTime: row.block_time,
  };
}

/**
 * Reserves come back from `numeric(38,18)` as decimal STRINGS and go straight
 * into `parseAmount`. They never pass through `Number`, which is the whole
 * point — a reserve is money, and a float that has lost the last decimal place
 * of a reserve prices every swap against that pool slightly wrong forever.
 */
function toPoolReserves(row: PoolReserveRow): PoolReservesRecord {
  return {
    market: row.market,
    pool: row.pool,
    token0: row.token0,
    token1: row.token1,
    decimals0: Number(row.decimals0),
    decimals1: Number(row.decimals1),
    reserve0: parseAmount(row.reserve0),
    reserve1: parseAmount(row.reserve1),
    baseToken: row.base_token,
    feeBps: Number(row.fee_bps),
    blockHeight: Number(row.block_height),
    blockHash: row.block_hash,
    blockTime: row.block_time,
    observedAt: row.observed_at,
  };
}

function toPosition(row: PositionRow): PositionRecord {
  return {
    market: row.market,
    account: row.account,
    size: parseAmount(row.size) as Amount,
    entryPrice: parseAmount(row.entry_price),
    blockHeight: Number(row.block_height),
    blockHash: row.block_hash,
  };
}
