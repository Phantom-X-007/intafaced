import type { Amount } from '@intafaced/ledger-client/money';
import type { BlockHash, BookSide, ChainBlock, TakerSide } from '../chain/source.js';

/**
 * THE PROJECTION STORE — the read model, and the reorg contract.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS INTERFACE IS SHAPED THE WAY IT IS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── The problem ────────────────────────────────────────────────────────────
 *
 * Chain data is not final on arrival. A projection that applies a block by
 * overwriting the current value cannot undo it, because the value it replaced
 * is gone. After a reorg it serves a price that was never on the canonical
 * chain, and nothing about it looks broken — no error, no gap, no alert. The
 * user sees a number. That is the failure this interface exists to make
 * impossible.
 *
 * ── The option not taken: confirmation depth alone ─────────────────────────
 *
 * The usual answer is "only project blocks that are N deep". It is not a reorg
 * strategy, it is a probability knob:
 *
 *   · it makes the read model N blocks stale, always, including the 99.9% of
 *     the time when nothing reorgs. For an order book that is the whole product
 *   · any N is still wrong for a reorg of depth N+1, and the failure mode is
 *     unchanged — silently serving a doomed branch
 *   · it does not answer the question. It reduces how often the question is
 *     asked
 *
 * ── The option taken: provenance + unwind ──────────────────────────────────
 *
 * Every projected row records the block that wrote it, and the state tables are
 * VERSIONED BY BLOCK HEIGHT — one row per (key, block) rather than one row per
 * key. "Current" is the newest version.
 *
 * Repairing a reorg is then `unwindTo(forkHeight + 1)`: delete the versions
 * above the fork. The previous version becomes current again by itself. No
 * replay, no compensating writes, no arithmetic that can be off by one — the
 * repair is a DELETE, and a DELETE is hard to get subtly wrong.
 *
 * The projection is therefore correct at every depth, and blocks can be
 * projected the moment they are seen. Confirmation depth survives as what it
 * actually is: the retention threshold for `prune`, i.e. the deepest reorg
 * repairable without a full re-index, plus a confidence number on reads.
 *
 * ── The cost, stated ───────────────────────────────────────────────────────
 *
 * Version rows, and a `DISTINCT ON` on every book read instead of a plain
 * scan. `prune` bounds the first; the second is served by an index whose
 * leading columns are exactly the DISTINCT ON key. The trade is deliberate:
 * this is a read model, and a read model that is fast and wrong is worth less
 * than one that is fast enough and right.
 *
 * ── What is NOT solved here ────────────────────────────────────────────────
 *
 * A reorg deeper than retained history. `findForkPoint` in `indexer.ts` refuses
 * rather than guesses — see the argument there.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MONEY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Prices, quantities and sizes are `Amount` (scaled bigint) across this
 * interface, decimal strings on the wire, and `numeric(38,18)` in Postgres.
 * Never `number`: an order book is nothing but sums, and a float sums
 * 0.1 + 0.2 to something that is not 0.3.
 */

export type BlockStatus = 'canonical' | 'orphaned';

export interface StoredBlock {
  readonly chainId: number;
  readonly height: number;
  readonly hash: BlockHash;
  readonly parentHash: BlockHash;
  readonly status: BlockStatus;
  readonly blockTime: Date;
  readonly eventCount: number;
}

export interface BookLevel {
  readonly price: Amount;
  readonly quantity: Amount;
}

export interface BookView {
  readonly market: string;
  readonly chainId: number;
  /** The canonical head this view is current as of. `null` on an empty index. */
  readonly asOfHeight: number | null;
  readonly asOfHash: BlockHash | null;
  /** Descending by price. */
  readonly bids: readonly BookLevel[];
  /** Ascending by price. */
  readonly asks: readonly BookLevel[];
}

export interface FillRecord {
  readonly blockHeight: number;
  readonly blockHash: BlockHash;
  readonly logIndex: number;
  readonly market: string;
  readonly price: Amount;
  readonly quantity: Amount;
  readonly takerSide: TakerSide;
  readonly maker: string;
  readonly taker: string;
  readonly blockTime: Date;
}

export interface PositionRecord {
  readonly market: string;
  readonly account: string;
  /** Signed: negative is short. A mirror of contract state, not a balance. */
  readonly size: Amount;
  readonly entryPrice: Amount;
  readonly blockHeight: number;
  readonly blockHash: BlockHash;
}

/**
 * An AMM pool's reserves as of a block, with everything needed to REFUSE them.
 *
 * ── Why this record exists ──────────────────────────────────────────────────
 *
 * `svc-protocol`'s `protocol.amm.quoteExactIn` is constant-product arithmetic
 * that takes `reserveIn` / `reserveOut` as INPUT, and nothing in the platform
 * produced them. That made the AMM a calculator with no inputs — the same shape
 * `dex.quote` was in before it was given real venues. This is the source that
 * makes wiring the AMM as a quote venue honest instead of invented.
 *
 * ── Provenance is not decoration here ───────────────────────────────────────
 *
 * **A reserve projection that lags is a wrong price**, and a wrong price is
 * worse than no price: an outage stops a user, an invented number encourages
 * one. So this carries not just the two reserves but everything a consumer
 * needs to decide it is not allowed to use them. Three clocks, three different
 * questions:
 *
 *   · `blockHeight` / `blockHash` — WHICH chain state this is. The sequence two
 *     reads are compared on to know they describe one chain, and what an unwind
 *     deletes above.
 *   · `blockTime` — the chain's own clock on the block that wrote this row.
 *     This is what measures how far behind the CHAIN a reserve is. A projection
 *     that is up, unhalted and twenty blocks behind looks perfectly healthy
 *     without it.
 *   · `observedAt` — OUR clock, when this projection recorded the row. A source
 *     that has silently stopped updating still answers and still looks healthy;
 *     only our own clock at the moment of the write catches that. Never
 *     synthesised from chain-supplied data.
 *
 * `svc-dex` enforces `QUOTE_MAX_AGE_MS` against `TimestampedBook.observedAt`.
 * These fields are what let it enforce the same ceiling on the INPUTS to a pool
 * quote rather than only on the quote it derived from them.
 *
 * ── Money, and the two fields that are not money ────────────────────────────
 *
 * `reserve0` / `reserve1` are `Amount` — scaled bigint, human token units,
 * `numeric(38,18)` in Postgres, decimal strings on the wire. A reserve is
 * money and is never a `number`. `feeBps` and `decimals*` are small integer
 * protocol parameters, exactly as `svc-protocol` models `feeBps`; see
 * `chain/source.ts` for why raw wei is the wrong storage unit and why
 * `decimals` has to travel with the reserve.
 */
export interface PoolReservesRecord {
  /** The symbol this pool prices. An adapter-assigned label, like `market`. */
  readonly market: string;
  /** The pool contract — THE identity of this row. A market may hold several. */
  readonly pool: string;
  readonly token0: string;
  readonly token1: string;
  readonly decimals0: number;
  readonly decimals1: number;
  /** Human units, scaled bigint. Never raw wei — see `chain/source.ts`. */
  readonly reserve0: Amount;
  readonly reserve1: Amount;
  /** Which of `token0`/`token1` is the base of `market`. Carried, not guessed. */
  readonly baseToken: string;
  readonly feeBps: number;
  readonly blockHeight: number;
  readonly blockHash: BlockHash;
  /** The writing block's own timestamp, from the chain. Not when we saw it. */
  readonly blockTime: Date;
  /** When THIS projection recorded the row. Our clock, not the chain's. */
  readonly observedAt: Date;
}

export interface ApplyOutcome {
  /**
   * True when this block's hash was already recorded canonical.
   *
   * TELEMETRY, NOT CONTROL FLOW. `applyBlock` performs its writes either way,
   * because the guarantee this service needs is that every write is idempotent
   * — not that some caller remembered to check a flag first. A skip branch
   * would mean the idempotent path is the one that never runs in production
   * and therefore the one nothing proves.
   */
  readonly duplicate: boolean;
  readonly eventsApplied: number;
}

export interface UnwindOutcome {
  readonly blocksOrphaned: number;
  readonly bookLevelsRemoved: number;
  readonly fillsRemoved: number;
  readonly positionsRemoved: number;
  readonly poolReservesRemoved: number;
}

export interface ProjectionStore {
  readonly chainId: number;

  // ── Chain of record ─────────────────────────────────────────────────────

  /** Highest canonical block, or `null` on an empty index. */
  head(): Promise<StoredBlock | null>;

  /** The canonical block at a height, if one is recorded. Never an orphan. */
  blockAt(height: number): Promise<StoredBlock | null>;

  /** Lowest canonical height still recorded — the floor `prune` has left. */
  earliestHeight(): Promise<number | null>;

  // ── Projection ──────────────────────────────────────────────────────────

  /**
   * Journal the block and project every one of its events, ATOMICALLY.
   *
   * Both, or neither. A crash between the two would leave a projection that
   * disagrees with the cursor claiming to describe it, and nothing anywhere
   * records that it was ever half-applied — so it can never be detected, only
   * served.
   *
   * A block whose hash is already recorded as orphaned is restored to
   * canonical. That is not an edge case: a chain that reorgs away from a branch
   * and back to it again is ordinary, and a projection that could not follow it
   * home would be stuck serving the loser.
   */
  applyBlock(block: ChainBlock): Promise<ApplyOutcome>;

  /**
   * Orphan every canonical block at or above `height` and delete what they
   * wrote. Atomic, for the same reason.
   *
   * Block rows are kept (marked `orphaned`) rather than deleted, until `prune`
   * ages them out: a projection that silently forgets it ever served a price
   * cannot afterwards explain what a user saw.
   */
  unwindTo(height: number): Promise<UnwindOutcome>;

  /**
   * Collapse superseded versions at or below `throughHeight`, keeping the
   * newest version of every key, and drop orphan block records that old.
   *
   * `throughHeight` is the finality horizon: below it we accept we will not be
   * unwinding, so the history that only existed to make an unwind possible has
   * no further job. Returns rows removed.
   */
  prune(throughHeight: number): Promise<number>;

  // ── Reads ───────────────────────────────────────────────────────────────

  book(market: string, depth: number): Promise<BookView>;
  recentFills(market: string, limit: number): Promise<readonly FillRecord[]>;
  fillsForAccount(account: string, limit: number): Promise<readonly FillRecord[]>;
  position(market: string, account: string): Promise<PositionRecord | null>;
  positionsOf(account: string): Promise<readonly PositionRecord[]>;

  /**
   * Current reserves for every pool projected against `market`.
   *
   * An ARRAY, and deliberately: a symbol can be served by several pools at
   * different fee tiers, and collapsing them here would pick a venue on the
   * caller's behalf using no information about the trade. Ordered by pool
   * address so two identical reads return the same thing in the same order —
   * a route that is a function of the SET, not of arrival order.
   *
   * Empty means "nothing projected", which is NOT "no liquidity". The read path
   * refuses rather than presenting an empty list as a market state; a pool that
   * genuinely holds nothing appears here with reserves of `0`, which is a fact
   * the chain stated and `quoteExactIn` already refuses (`amm.no_liquidity`).
   */
  poolReservesFor(market: string): Promise<readonly PoolReservesRecord[]>;

  /** Current reserves for one pool, by contract address. Case-insensitive. */
  poolReserve(pool: string): Promise<PoolReservesRecord | null>;

  /** Current reserves for every projected pool. Discovery, like `markets()`. */
  pools(): Promise<readonly PoolReservesRecord[]>;

  /** Distinct markets with any projected state. Small, and it drives the UI. */
  markets(): Promise<readonly string[]>;
}
