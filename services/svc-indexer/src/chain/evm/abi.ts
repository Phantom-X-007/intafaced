import { encodeEventTopics, type AbiEvent, type Hex } from 'viem';

/**
 * THE VENUE EVENT SURFACE this adapter decodes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHOSE SIGNATURES THESE ARE, AND WHAT THAT MEANS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * They are OURS. No audited production CLOB implements this surface today, and
 * nothing in this repository claims one does — SOCKET §13
 * `socket.clob-contracts`. `contracts/dev/DevVenue.sol` is the only thing that
 * emits them, it is a dev fixture, and its header says so at length.
 *
 * So read the split honestly, because it is the whole point of this module:
 *
 *   · the ADAPTER is real. `EvmChainSource` walks a real chain over a real
 *     JSON-RPC, links real block hashes to real parent hashes, pulls logs by
 *     BLOCK HASH, and detects a real reorg. None of that depends on which ABI
 *     it decodes, and all of it is now tested against a chain that really forks
 *   · the ABI is a DECLARATION. When the production venue lands, either it emits
 *     these three events or this file changes with it. `abi.test.ts` keeps the
 *     hand-written declaration below and the compiled artefact in agreement, and
 *     that is the only agreement it can prove
 *
 * Hand-written, in the style of `svc-protocol/src/chain/abi.ts`, so a reviewer
 * can diff it against the Solidity by eye — and then `abi.test.ts` does it
 * mechanically against the compiler's own output.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ENCODING — the two decisions worth arguing about
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **Amounts are `uint256`/`int256` with eighteen implied decimals**, which is
 * EXACTLY the representation `@intafaced/ledger-client/money` uses in memory
 * (`Amount` = value × 10^18) and exactly what `numeric(38,18)` holds in
 * Postgres. So there is no conversion step and no scale to get wrong: the
 * on-chain integer IS the scaled bigint. `formatAmount` renders it for the port,
 * `parseAmount` reads it back, and the round trip is exact at all eighteen
 * places. A `number` never appears on this path — an 18-decimal price does not
 * survive a float, and a uint256 does not survive one at all.
 *
 * **`market` is `bytes32`, not `string`.** It is `indexed`, and an indexed
 * dynamic type is stored as a keccak hash of its contents — the symbol would be
 * unrecoverable, so an indexer could never tell you which market a fill was in.
 * A `bytes32` of left-aligned ASCII survives indexing intact, keeps the topic
 * filterable, and costs nothing. The 32-byte ceiling is far above any symbol
 * anyone would trade; `decode.ts` refuses anything that is not printable ASCII
 * rather than guessing an encoding.
 */

/**
 * `side` on `BookLevel`. Positional, because a `uint8` on the wire is cheaper
 * than a string and the mapping belongs in exactly one place.
 */
export const BOOK_SIDES = ['bid', 'ask'] as const;

/** `takerSide` on `Fill`. Same reasoning. */
export const TAKER_SIDES = ['buy', 'sell'] as const;

export const bookLevelEvent = {
  type: 'event',
  name: 'BookLevel',
  inputs: [
    { name: 'market', type: 'bytes32', indexed: true },
    { name: 'side', type: 'uint8', indexed: false },
    { name: 'price', type: 'uint256', indexed: false },
    { name: 'quantity', type: 'uint256', indexed: false },
  ],
} as const satisfies AbiEvent;

export const fillEvent = {
  type: 'event',
  name: 'Fill',
  inputs: [
    { name: 'market', type: 'bytes32', indexed: true },
    { name: 'maker', type: 'address', indexed: true },
    { name: 'taker', type: 'address', indexed: true },
    { name: 'price', type: 'uint256', indexed: false },
    { name: 'quantity', type: 'uint256', indexed: false },
    { name: 'takerSide', type: 'uint8', indexed: false },
  ],
} as const satisfies AbiEvent;

export const positionEvent = {
  type: 'event',
  name: 'Position',
  inputs: [
    { name: 'market', type: 'bytes32', indexed: true },
    { name: 'account', type: 'address', indexed: true },
    { name: 'size', type: 'int256', indexed: false },
    { name: 'entryPrice', type: 'uint256', indexed: false },
  ],
} as const satisfies AbiEvent;

/**
 * Everything this adapter knows how to decode.
 *
 * Note what is NOT here: any function at all. There is no `write` surface on
 * this ABI because there is no transaction this service is entitled to send —
 * §16.10, and the reason `env.ts` declares no key. An ABI with a state-changing
 * function on it would be the first thing a future edit reached for.
 */
export const venueAbi = [bookLevelEvent, fillEvent, positionEvent] as const;

export type VenueEventName = (typeof venueAbi)[number]['name'];

/**
 * topic0 → event name, computed from the ABI rather than pasted in.
 *
 * A hard-coded topic hash is a string nobody can check by reading; deriving it
 * means a change to a signature above changes the filter automatically, and a
 * typo in a signature fails the ABI-vs-artefact test instead of silently
 * matching nothing. "Silently matching nothing" is the worst outcome available
 * to a log decoder: the projection stays empty and every read answers "no
 * liquidity" about a market that has plenty.
 */
export const VENUE_TOPICS: ReadonlyMap<Hex, VenueEventName> = new Map(
  venueAbi.map((event) => [encodeEventTopics({ abi: venueAbi, eventName: event.name })[0] as Hex, event.name]),
);
