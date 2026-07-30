// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/*
 * DevVenue — a DEV-ONLY emitter of the venue event surface svc-indexer reads.
 *
 * (A plain block comment, not natspec: solc parses `@word` inside `/**` as a
 * documentation tag, and this header names package paths that begin with `@`.)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * READ THIS BEFORE YOU BELIEVE ANYTHING ABOUT IT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THIS IS NOT A VENUE. It holds no order book, matches nothing, custodies
 * nothing, and has no access control of any kind — every function below is
 * `external` and callable by anybody. It is a log emitter, and that is its
 * entire job.
 *
 * It exists because `src/chain/evm/source.ts` is a real adapter against a real
 * EVM RPC, and an adapter that has never decoded a log that a chain actually
 * produced is an adapter nobody has tested. Until this file existed, every
 * assertion about the indexer's reorg behaviour was made against
 * `MemoryChainSource` — a deterministic fake whose hashes this repo computes
 * itself. That proves the projection matches the design. It does not prove the
 * decoder matches an EVM.
 *
 * ── The event signatures ARE the contract, and they are ours ────────────────
 *
 * `src/chain/evm/abi.ts` declares these three events as the surface the adapter
 * decodes, and `src/chain/evm/abi.test.ts` checks the hand-written declaration
 * against the ABI the compiler produced from THIS file. That check makes the
 * two agree; it does not make either of them a standard. No audited production
 * CLOB implements this surface today — see SOCKET §13 `socket.clob-contracts`.
 * When the real one lands, either it emits these signatures or this file and
 * `abi.ts` change together and the test says so.
 *
 * ── It must never be deployed anywhere that matters ─────────────────────────
 *
 * Anyone can call `recordFill` with any numbers they like. On a chain whose
 * state somebody depends on, that would be a contract that publishes lies about
 * trades into a read model users look at. `scripts/dev-venue.ts` refuses to
 * deploy it against anything that does not identify itself as a throwaway
 * anvil/hardhat node on the dev chain id, which is the same guard
 * svc-protocol's `scripts/dev-chain.ts` applies to the public dev mnemonic.
 *
 * ── Amount encoding, stated once ────────────────────────────────────────────
 *
 * Every price, quantity, size and entry price is a `uint256` (or `int256`)
 * carrying EIGHTEEN implied decimals — the same scale `numeric(38,18)` uses in
 * Postgres and the same scale `@intafaced/ledger-client/money` uses in memory.
 * So `1.5` is `1500000000000000000`. No conversion happens anywhere; the
 * on-chain integer IS the scaled bigint. `abi.ts` says the same thing from the
 * TypeScript side, and the round trip is asserted at 18 decimal places.
 *
 * `market` is a `bytes32` holding left-aligned ASCII ("ETH-USD" padded with
 * zero bytes) rather than a string: it is `indexed`, so a `string` would arrive
 * as an unreadable keccak hash and the adapter could never recover the symbol.
 */
contract DevVenue {
    /** Book side, as the adapter decodes it. Any other value is rejected. */
    uint8 public constant SIDE_BID = 0;
    uint8 public constant SIDE_ASK = 1;

    /** Which side took liquidity. Any other value is rejected. */
    uint8 public constant TAKER_BUY = 0;
    uint8 public constant TAKER_SELL = 1;

    /**
     * A price level's new ABSOLUTE total resting at `price`. `quantity == 0`
     * means the level is empty, which is not the same as the level being absent
     * from the block — absent means UNCHANGED. The indexer depends on this being
     * absolute rather than a delta: it is what makes re-applying a block a no-op
     * and unwinding a reorg a pure DELETE.
     */
    event BookLevel(bytes32 indexed market, uint8 side, uint256 price, uint256 quantity);

    /**
     * A trade. Immutable once mined, and identified downstream by
     * (block hash, log index) — the chain's own identity for a log.
     */
    event Fill(
        bytes32 indexed market,
        address indexed maker,
        address indexed taker,
        uint256 price,
        uint256 quantity,
        uint8 takerSide
    );

    /** An account's ABSOLUTE signed position. Negative is short. */
    event Position(bytes32 indexed market, address indexed account, int256 size, uint256 entryPrice);

    /**
     * A log the indexer must IGNORE.
     *
     * Not decoration. A real venue address emits events this adapter does not
     * know — an ownership transfer, an upgrade, a pause — and an adapter that
     * throws on the first unrecognised topic stops the whole projection on a log
     * that was never its business. `source.test.ts` emits this one and asserts
     * the block still indexes, with the unrelated log absent rather than
     * mangled into something.
     */
    event Unrelated(uint256 nonce);

    function publishLevel(bytes32 market, uint8 side, uint256 price, uint256 quantity) external {
        emit BookLevel(market, side, price, quantity);
    }

    /**
     * Several levels in ONE transaction, and therefore in one block with real
     * chain-assigned log indices. A test that needs a multi-log block otherwise
     * has to turn off automine and manage nonces by hand, which is a source of
     * flakes that has nothing to do with what is being tested.
     */
    function publishLevels(
        bytes32 market,
        uint8[] calldata sides,
        uint256[] calldata prices,
        uint256[] calldata quantities
    ) external {
        require(sides.length == prices.length && prices.length == quantities.length, "DevVenue: length mismatch");
        for (uint256 i = 0; i < sides.length; i++) {
            emit BookLevel(market, sides[i], prices[i], quantities[i]);
        }
    }

    function recordFill(
        bytes32 market,
        address maker,
        address taker,
        uint256 price,
        uint256 quantity,
        uint8 takerSide
    ) external {
        emit Fill(market, maker, taker, price, quantity, takerSide);
    }

    function publishPosition(bytes32 market, address account, int256 size, uint256 entryPrice) external {
        emit Position(market, account, size, entryPrice);
    }

    /** One block carrying all three kinds. Struct-in-calldata to stay off the stack. */
    struct Batch {
        bytes32 market;
        uint8 side;
        uint256 levelPrice;
        uint256 levelQuantity;
        address maker;
        address taker;
        uint256 fillPrice;
        uint256 fillQuantity;
        uint8 takerSide;
        address account;
        int256 size;
        uint256 entryPrice;
    }

    function publishAll(Batch calldata b) external {
        emit BookLevel(b.market, b.side, b.levelPrice, b.levelQuantity);
        emit Fill(b.market, b.maker, b.taker, b.fillPrice, b.fillQuantity, b.takerSide);
        emit Position(b.market, b.account, b.size, b.entryPrice);
    }

    function emitUnrelated(uint256 nonce) external {
        emit Unrelated(nonce);
    }
}
