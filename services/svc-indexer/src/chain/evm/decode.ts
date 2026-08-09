import { decodeEventLog, type Hex, type Log } from 'viem';
import { formatAmount } from '@intafaced/ledger-client/money';
import { BOOK_SIDES, TAKER_SIDES, venueAbi, VENUE_TOPICS } from './abi.js';
import { ChainDataError, type ChainEvent } from '../source.js';

/**
 * LOG → `ChainEvent`. The only place an EVM word becomes something this service
 * will project.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MONEY: THE CONVERSION THAT ISN'T ONE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * An on-chain `uint256` price with eighteen implied decimals and an
 * `@intafaced/ledger-client/money` `Amount` are THE SAME NUMBER in the same
 * representation — value × 10^18, held as a bigint. So there is no scaling step
 * here, and that is the point: a scale factor is a thing you can get wrong by a
 * factor of a thousand, silently, and only on the values nobody eyeballed.
 *
 * `formatAmount` renders the bigint as a decimal string because the `ChainSource`
 * port speaks decimal strings, and the port re-parses it with `parseAmount`. The
 * round trip is exact at all eighteen places — `evm/decode.test.ts` runs
 * `10n ** 18n - 1n` through it, i.e. eighteen nines. Paying for one
 * format/parse per field buys the port's validation on adapter output, which is
 * worth more than the microseconds: an adapter is exactly the component that
 * yields a malformed price, and it should be told so at the boundary where it can
 * still be blamed.
 *
 * `Number()` never touches an amount in this file. A uint256 does not fit in a
 * double at all — 2^53 is where a `number` stops counting, and a wei-scale price
 * passes that at 0.009 of a unit.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT AN UNRECOGNISED LOG DOES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It is skipped, and that is deliberate rather than lazy. A real venue address
 * emits events this adapter has never heard of — an ownership transfer, an
 * upgrade, a pause — and an adapter that throws on the first unknown topic0
 * stops the entire projection on a log that was never its business. A malformed
 * log with a topic0 we DO claim to understand is the opposite case, and it throws:
 * that one means the adapter and the contract disagree, and continuing past it
 * would project a guess.
 */

/** A log as viem returns it from `getLogs` with no ABI filter applied. */
export type RawLog = Log<bigint, number, false>;

/**
 * `numeric(38,18)` holds 38 significant digits, 18 of them fractional — so 20
 * integer digits, and a magnitude strictly below 10^38 once scaled.
 *
 * A `uint256` reaches ~1.16 × 10^77. Anything above this bound cannot be stored,
 * and the failure without this check is ugly: the insert raises a numeric
 * overflow deep inside `applyBlock`, the block's transaction rolls back, and the
 * ingest loop retries the same block forever with a Postgres error nobody reads
 * as "the chain published a number too big for the read model". Refusing here
 * names the field and the value.
 *
 * It is checked in the decoder rather than in the port because it is a property
 * of THIS adapter's source: a uint256 is the only thing in the system that can
 * produce a value this large. `MemoryChainSource` writes decimal strings a human
 * typed.
 */
export const MAX_STORABLE_SCALED = 10n ** 38n;

function amountString(value: bigint, what: string): string {
  const magnitude = value < 0n ? -value : value;
  if (magnitude >= MAX_STORABLE_SCALED) {
    throw new ChainDataError(
      `${what} is ${value}, which exceeds what numeric(38,18) can hold (|value| < 10^38 scaled). ` +
        `Refusing to project a number that would be stored wrong or not at all.`,
      'indexer.amount_out_of_range',
    );
  }
  return formatAmount(value);
}

/**
 * `bytes32` of left-aligned ASCII → market symbol.
 *
 * Right-padding with zero bytes is how Solidity's `bytes32("ETH-USD")` literal
 * lays out, so trailing NULs are stripped and everything left must be printable
 * ASCII. Anything else is refused rather than guessed: a symbol decoded from the
 * wrong encoding becomes a *new market* in the read model — it does not look like
 * an error, it looks like liquidity that appeared from nowhere and split the book
 * for the real symbol in two.
 */
export function marketFromBytes32(value: Hex, what = 'market'): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new ChainDataError(`${what} must be a 32-byte hex word, got "${value}"`, 'indexer.bad_market');
  }
  const bytes = Buffer.from(value.slice(2), 'hex');
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end -= 1;
  if (end === 0) {
    throw new ChainDataError(`${what} is all zero bytes — a fill with no market is not projectable`, 'indexer.bad_market');
  }
  const symbol = bytes.subarray(0, end).toString('latin1');
  // Interior NULs and anything outside printable ASCII: not a symbol we will
  // invent a decoding for.
  if (!/^[\x20-\x7e]+$/.test(symbol)) {
    throw new ChainDataError(`${what} is not printable ASCII (${value})`, 'indexer.bad_market');
  }
  return symbol;
}

function sideOf(raw: number, what: string): (typeof BOOK_SIDES)[number] {
  const side = BOOK_SIDES[raw];
  if (!side) throw new ChainDataError(`${what} must be 0 (bid) or 1 (ask), got ${raw}`, 'indexer.bad_side');
  return side;
}

function takerSideOf(raw: number, what: string): (typeof TAKER_SIDES)[number] {
  const side = TAKER_SIDES[raw];
  if (!side) throw new ChainDataError(`${what} must be 0 (buy) or 1 (sell), got ${raw}`, 'indexer.bad_side');
  return side;
}

/**
 * Addresses are lowercased on the way in.
 *
 * `positions` is keyed on `(chain_id, market, account, block_height)` and read
 * with `DISTINCT ON (market, account)`. Both are case-SENSITIVE over the text,
 * while the read filters use `lower(...)` on both sides. viem returns checksummed
 * addresses consistently, so mixed forms would not arise today — but if two
 * spellings of one address ever did land in that table, `DISTINCT ON` would
 * report the same account twice with two different sizes, and that is a wrong
 * answer rather than a missing one. One canonical spelling at the boundary costs
 * nothing and makes the state unrepresentable.
 */
function addressOf(value: string): string {
  return value.toLowerCase();
}

/**
 * Decode one log, or `null` if this adapter does not claim its topic0.
 *
 * Throws `ChainDataError` when the topic IS claimed and the payload does not
 * decode — the adapter and the contract disagreeing is not something to skip
 * past.
 */
export function decodeVenueLog(log: RawLog): ChainEvent | null {
  const topic0 = log.topics[0];
  if (!topic0) return null; // an anonymous event; not ours by definition
  const eventName = VENUE_TOPICS.get(topic0);
  if (!eventName) return null;

  if (log.logIndex === null || log.logIndex === undefined) {
    throw new ChainDataError(
      `a ${eventName} log arrived with no logIndex, so it has no stable identity — refusing to project it`,
      'indexer.bad_log_index',
    );
  }
  const logIndex = log.logIndex;

  let decoded: ReturnType<typeof decodeEventLog>;
  try {
    decoded = decodeEventLog({ abi: venueAbi, data: log.data, topics: log.topics });
  } catch (err) {
    throw new ChainDataError(
      `a log with the ${eventName} topic did not decode against this service's ABI ` +
        `(${(err as Error).message}). The venue contract and src/chain/evm/abi.ts disagree.`,
      'indexer.bad_event',
    );
  }

  switch (decoded.eventName) {
    case 'BookLevel': {
      const args = decoded.args as { market: Hex; side: number; price: bigint; quantity: bigint };
      return {
        kind: 'book_level',
        logIndex,
        market: marketFromBytes32(args.market, 'book level market'),
        side: sideOf(args.side, 'book level side'),
        price: amountString(args.price, 'book level price'),
        quantity: amountString(args.quantity, 'book level quantity'),
      };
    }
    case 'Fill': {
      const args = decoded.args as {
        market: Hex;
        maker: string;
        taker: string;
        price: bigint;
        quantity: bigint;
        takerSide: number;
      };
      // A trade of zero is not a trade. Book levels may be empty (qty 0);
      // fills may not. Refuse here with a named field rather than letting
      // assertValidBlock throw later as a generic bad_amount the ingest loop
      // treats like a transient store failure.
      if (args.quantity <= 0n) {
        throw new ChainDataError(`fill quantity must be positive, got ${args.quantity}`, 'indexer.bad_amount');
      }
      return {
        kind: 'fill',
        logIndex,
        market: marketFromBytes32(args.market, 'fill market'),
        price: amountString(args.price, 'fill price'),
        quantity: amountString(args.quantity, 'fill quantity'),
        takerSide: takerSideOf(args.takerSide, 'fill takerSide'),
        maker: addressOf(args.maker),
        taker: addressOf(args.taker),
      };
    }
    case 'Position': {
      const args = decoded.args as { market: Hex; account: string; size: bigint; entryPrice: bigint };
      return {
        kind: 'position',
        logIndex,
        market: marketFromBytes32(args.market, 'position market'),
        account: addressOf(args.account),
        // Signed on purpose: negative is short. It mirrors a number in a
        // contract; it is not a balance this service holds (§0.6).
        size: amountString(args.size, 'position size'),
        entryPrice: amountString(args.entryPrice, 'position entry price'),
      };
    }
    default:
      // Unreachable: VENUE_TOPICS is derived from the same ABI decodeEventLog
      // was given. Present so adding an event to abi.ts without handling it here
      // is a type error rather than a silent drop.
      return null;
  }
}

/**
 * Decode a block's worth of logs, in the chain's own order.
 *
 * Log indices are the CHAIN's, never renumbered. A fill's primary key is
 * `(block hash, log index)`, so renumbering would change a fill's identity
 * between one index pass and the next — which is precisely the idempotency the
 * projection depends on. Gaps are expected and correct: they are the logs other
 * contracts in the same block emitted.
 */
export function decodeVenueLogs(logs: readonly RawLog[]): ChainEvent[] {
  return [...logs]
    .sort((a, b) => (a.logIndex ?? 0) - (b.logIndex ?? 0))
    .map(decodeVenueLog)
    .filter((event): event is ChainEvent => event !== null);
}
