import { parseAmount, type Amount } from '@intafaced/ledger-client/money';

/**
 * THE `ChainSource` PORT — the only thing this service reads from.
 *
 * Everything downstream of here (projection, reorg repair, the read API) is
 * written against this interface and nothing else, which is what makes the
 * reorg behaviour testable at all: a real chain will not fork on demand, and a
 * design whose central property can only be observed in production is a design
 * nobody has checked.
 *
 * ── There is deliberately no EVM implementation in this PR ──────────────────
 *
 * SOCKET §13 (`socket.evm-rpc`). There is no EVM RPC anywhere in this stack —
 * svc-protocol already records the same gap (its `PROTOCOL_RPC_URL` points
 * outside the compose network and a clean clone has none), and there are no
 * deployed CLOB contracts for an adapter to read. Writing one now would mean
 * inventing event signatures for contracts that do not exist and shipping a
 * mock behind a production-looking name. The socket is declared instead; the
 * port is the shape the adapter must satisfy, and `MemoryChainSource` is the
 * reference implementation its conformance is judged against.
 *
 * ── The one demand this port makes of any implementation ────────────────────
 *
 * **Events carry absolute state, never a delta.** A `book_level` event says
 * "the total resting at this price is now X", not "add X". A `position` event
 * says "this account's size is now X". Two properties fall out of that and
 * nothing else buys both:
 *
 *   · re-applying a block is a no-op, so idempotency is structural rather than
 *     a dedupe table someone can forget to consult
 *   · unwinding a reorg is a delete of the newer version, with no compensating
 *     arithmetic to get wrong
 *
 * A chain that only emits deltas is not excluded — it means its adapter must
 * reduce them to absolute state before yielding a block. That reduction is the
 * adapter's problem precisely because it is the part that needs the chain's own
 * state reads to be correct.
 */

export type BookSide = 'bid' | 'ask';
export type TakerSide = 'buy' | 'sell';

/** 0x + 64 lowercase hex. Normalised, because a hash compared two ways is a bug. */
export type BlockHash = string;

export interface ChainHead {
  readonly height: number;
  readonly hash: BlockHash;
}

interface EventBase {
  /**
   * Position within the block. The chain's own ordering, kept because it is
   * half of a fill's natural primary key and the only stable tiebreak for
   * events that touch the same key twice in one block.
   */
  readonly logIndex: number;
}

/**
 * A price level's new ABSOLUTE total. `quantity: '0'` means the level is empty.
 *
 * Absent from a block means UNCHANGED, never removed — conflating those two is
 * how a book grows phantom liquidity (the same rule
 * `packages/market-data/src/depth.ts` states for the fiat-plane book, for the
 * same reason).
 */
export interface BookLevelEvent extends EventBase {
  readonly kind: 'book_level';
  readonly market: string;
  readonly side: BookSide;
  /** Decimal string on the wire. Parsed to scaled bigint before use. */
  readonly price: string;
  readonly quantity: string;
}

/** A trade that happened. Immutable, and identified by (block hash, log index). */
export interface FillEvent extends EventBase {
  readonly kind: 'fill';
  readonly market: string;
  readonly price: string;
  readonly quantity: string;
  readonly takerSide: TakerSide;
  readonly maker: string;
  readonly taker: string;
}

/**
 * An account's ABSOLUTE position in a market, as the contract holds it.
 *
 * `size` is signed — negative is short. It is a mirror of a number in a
 * contract at an address derived from the user's own key; it is not a balance
 * this service holds, and there is no code path here that can change it.
 */
export interface PositionEvent extends EventBase {
  readonly kind: 'position';
  readonly market: string;
  readonly account: string;
  readonly size: string;
  readonly entryPrice: string;
}

/**
 * AN AMM POOL'S ABSOLUTE RESERVES, as the pool contract holds them.
 *
 * ── Why this event exists ───────────────────────────────────────────────────
 *
 * `svc-protocol`'s `protocol.amm.quoteExactIn` is constant-product arithmetic
 * that takes `reserveIn` / `reserveOut` as INPUT. Nothing in the platform
 * produced them, so the AMM was a calculator with no inputs — the same shape
 * `dex.quote` was in before it was given real venues. This is the source that
 * makes wiring the AMM as a quote venue honest rather than invented.
 *
 * ── Units: human, 18 decimal places, never raw wei ──────────────────────────
 *
 * `reserve0` / `reserve1` are decimal strings in HUMAN token units, parsed to
 * `Amount` (scaled bigint, 10^18) and stored `numeric(38,18)` — the same money
 * rule as every other amount in this service. A pool contract holds raw uint256
 * balances at the token's own decimals; converting is the ADAPTER's job,
 * exactly as reducing deltas to absolute state is, and for the same reason: it
 * is the part that needs the chain's own reads to be correct.
 *
 * Two things follow, and both are load-bearing for a consumer:
 *
 *   · `decimals0` / `decimals1` are carried so the raw uint256 the contract
 *     holds can be reconstructed EXACTLY — `raw = Amount / 10^(18 - decimals)`,
 *     which is exact because the adapter produced the Amount by scaling up from
 *     that same raw integer. A consumer that needs the value the contract will
 *     actually pay, to the last raw unit, converts back before quoting.
 *   · constant-product `getAmountOut` is homogeneous: scaling `amountIn` and
 *     `reserveIn` by the same factor leaves the answer unchanged, and the
 *     answer scales with `reserveOut`. So feeding it three Amounts yields an
 *     Amount, and for 18-decimal tokens that is bit-identical to the contract.
 *     For a 6-decimal token the floor division happens at a finer granularity
 *     than the chain's, so the result can differ by less than one raw unit —
 *     which is why `decimals` is here rather than assumed to be 18.
 *
 * Storing raw wei instead would have been the other option and it is worse:
 * `numeric(38,18)` leaves twenty digits before the point, and an 18-decimal
 * token with a large supply overflows that in raw units while fitting
 * comfortably in human ones.
 *
 * ── Orientation is carried, not guessed ─────────────────────────────────────
 *
 * A pool orders its tokens by address (`token0` < `token1`); a market symbol
 * orders them by meaning (`IFC-USD` is IFC priced in USD). Those two orderings
 * agree by coincidence half the time. `baseToken` says which of the pair the
 * symbol's BASE is, so a consumer picks `reserveIn`/`reserveOut` from a fact
 * rather than from a convention — getting it backwards inverts the price and
 * produces a number that looks entirely plausible.
 *
 * ── The two `number` fields, and why they are allowed ───────────────────────
 *
 * `feeBps` and `decimals*` are `number`. Neither is money: they are small
 * integer protocol parameters, exactly as `svc-protocol` models `feeBps`.
 * `getAmountOut` already refuses a non-integer fee. No reserve, price or amount
 * anywhere in this file is anything but a decimal string.
 */
export interface PoolReservesEvent extends EventBase {
  readonly kind: 'pool_reserves';
  /** The symbol this pool prices, e.g. `IFC-USD`. An adapter-assigned label. */
  readonly market: string;
  /** The pool contract. THE identity of this row — a market may hold several. */
  readonly pool: string;
  readonly token0: string;
  readonly token1: string;
  /** Token decimals, so raw uint256 can be reconstructed exactly. 0–18. */
  readonly decimals0: number;
  readonly decimals1: number;
  /** ABSOLUTE reserves in human units. Decimal strings; `'0'` is legal. */
  readonly reserve0: string;
  readonly reserve1: string;
  /** Which of `token0`/`token1` is the base of `market`. */
  readonly baseToken: string;
  /** Swap fee in basis points, as the pool reports it. */
  readonly feeBps: number;
}

export type ChainEvent = BookLevelEvent | FillEvent | PositionEvent | PoolReservesEvent;

export interface ChainBlock {
  readonly chainId: number;
  readonly height: number;
  readonly hash: BlockHash;
  readonly parentHash: BlockHash;
  /** Unix seconds, from the block itself. Not when we observed it. */
  readonly timestamp: number;
  readonly events: readonly ChainEvent[];
}

export interface ChainSource {
  readonly chainId: number;

  /** The canonical tip. `null` when the source has no chain to report. */
  head(): Promise<ChainHead | null>;

  /**
   * The CANONICAL block at a height, as the source believes it right now.
   *
   * This is the method fork detection turns on: asking the same height twice
   * across a reorg must return two different hashes. An implementation that
   * memoises by height is not an implementation of this interface.
   */
  blockAt(height: number): Promise<ChainBlock | null>;
}

// ── Validation ──────────────────────────────────────────────────────────────
//
// Parsed at the port boundary rather than deeper in, so an adapter that yields
// a malformed price fails where the adapter can be blamed. Every amount becomes
// a scaled bigint here and stays one until it is formatted for the wire — a
// `number` never touches a price in this service.

export class ChainDataError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ChainDataError';
  }
}

const HASH_RE = /^0x[0-9a-f]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function assertBlockHash(value: string, what: string): BlockHash {
  if (!HASH_RE.test(value)) {
    throw new ChainDataError(`${what} must be 0x + 64 lowercase hex, got "${value}"`, 'indexer.bad_hash');
  }
  return value;
}

export function assertAddress(value: string, what: string): string {
  if (!ADDRESS_RE.test(value)) {
    throw new ChainDataError(`${what} must be a 20-byte hex address, got "${value}"`, 'indexer.bad_address');
  }
  return value;
}

/** Decimal string → scaled bigint, with the field name in the failure. */
export function amountOf(value: string, what: string): Amount {
  try {
    return parseAmount(value);
  } catch (err) {
    throw new ChainDataError(`${what}: ${(err as Error).message}`, 'indexer.bad_amount');
  }
}

export function positiveAmountOf(value: string, what: string): Amount {
  const parsed = amountOf(value, what);
  if (parsed <= 0n) throw new ChainDataError(`${what} must be positive, got "${value}"`, 'indexer.bad_amount');
  return parsed;
}

export function nonNegativeAmountOf(value: string, what: string): Amount {
  const parsed = amountOf(value, what);
  if (parsed < 0n) throw new ChainDataError(`${what} must not be negative, got "${value}"`, 'indexer.bad_amount');
  return parsed;
}

/** Token decimals. Bounded at 18 because that is the ledger's own scale. */
export function assertDecimals(value: number, what: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 18) {
    throw new ChainDataError(`${what} must be an integer 0–18, got ${value}`, 'indexer.bad_decimals');
  }
  return value;
}

/**
 * Swap fee in basis points.
 *
 * The ceiling matches `svc-protocol`'s AMM math (`amm.bad_fee` above 1000).
 * A projection that accepted a fee its own quote math refuses would store a
 * pool nothing could ever price, and the failure would surface as an error from
 * the quote path with no clue that the reserve row was where it went wrong.
 */
export function assertFeeBps(value: number, what: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 1000) {
    throw new ChainDataError(`${what} must be an integer 0–1000 bps, got ${value}`, 'indexer.bad_fee');
  }
  return value;
}

/**
 * Structural checks a block must pass before any of it is projected.
 *
 * All-or-nothing on purpose: a block is applied in one transaction, so a block
 * with one bad event must be rejected whole rather than half-projected. Half a
 * block is the state no amount of later reorg handling can reason about,
 * because nothing records that it was ever half-applied.
 */
export function assertValidBlock(block: ChainBlock): void {
  assertBlockHash(block.hash, 'block hash');
  assertBlockHash(block.parentHash, 'parent hash');

  if (!Number.isSafeInteger(block.height) || block.height < 0) {
    throw new ChainDataError(`block height must be a non-negative integer, got ${block.height}`, 'indexer.bad_height');
  }
  if (block.hash === block.parentHash) {
    throw new ChainDataError(`block ${block.height} is its own parent`, 'indexer.bad_parent');
  }

  const seen = new Set<number>();
  for (const event of block.events) {
    if (!Number.isSafeInteger(event.logIndex) || event.logIndex < 0) {
      throw new ChainDataError(`log index must be a non-negative integer, got ${event.logIndex}`, 'indexer.bad_log_index');
    }
    // Log index is half of a fill's primary key. Two events sharing one in the
    // same block would make an insert collide with an unrelated event and
    // silently drop it — which is exactly the double-count-adjacent bug the
    // key exists to prevent, arriving from the other direction.
    if (seen.has(event.logIndex)) {
      throw new ChainDataError(`duplicate logIndex ${event.logIndex} in block ${block.height}`, 'indexer.duplicate_log_index');
    }
    seen.add(event.logIndex);

    switch (event.kind) {
      case 'book_level':
        positiveAmountOf(event.price, 'book level price');
        nonNegativeAmountOf(event.quantity, 'book level quantity');
        break;
      case 'fill':
        positiveAmountOf(event.price, 'fill price');
        positiveAmountOf(event.quantity, 'fill quantity');
        assertAddress(event.maker, 'fill maker');
        assertAddress(event.taker, 'fill taker');
        break;
      case 'position':
        // Signed: negative is short. Only the entry price is bounded below.
        amountOf(event.size, 'position size');
        nonNegativeAmountOf(event.entryPrice, 'position entry price');
        assertAddress(event.account, 'position account');
        break;

      case 'pool_reserves': {
        assertAddress(event.pool, 'pool address');
        assertAddress(event.token0, 'pool token0');
        assertAddress(event.token1, 'pool token1');
        assertAddress(event.baseToken, 'pool base token');
        // A pool of a token against itself has no price, and the reserve pair
        // would be one number counted twice.
        if (event.token0.toLowerCase() === event.token1.toLowerCase()) {
          throw new ChainDataError(`pool ${event.pool} pairs ${event.token0} with itself`, 'indexer.bad_pool');
        }
        // Orientation must name a token that is actually in the pool. A
        // baseToken outside the pair silently inverts every price derived from
        // it, and nothing downstream can detect that from the numbers alone.
        const base = event.baseToken.toLowerCase();
        if (base !== event.token0.toLowerCase() && base !== event.token1.toLowerCase()) {
          throw new ChainDataError(
            `pool ${event.pool} base token ${event.baseToken} is neither token0 (${event.token0}) nor token1 (${event.token1})`,
            'indexer.bad_pool',
          );
        }
        assertDecimals(event.decimals0, 'pool token0 decimals');
        assertDecimals(event.decimals1, 'pool token1 decimals');
        assertFeeBps(event.feeBps, 'pool fee');
        // Zero is legal and meaningful — a pool that has been created but never
        // seeded, or fully burned, really does hold nothing. It is NOT the same
        // as "we have no reserve row", which the read path refuses outright.
        nonNegativeAmountOf(event.reserve0, 'pool reserve0');
        nonNegativeAmountOf(event.reserve1, 'pool reserve1');
        break;
      }
    }
  }
}
