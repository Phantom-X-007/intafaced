// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SovereignToken} from "./SovereignToken.sol";

/**
 * TOKEN FACTORY — deterministic, permissionless, non-authorising (§8.4).
 *
 * Deploys `SovereignToken` via CREATE2 so the token's address is known before
 * the token exists. A creator can be shown the address, publish it, and only
 * then pay for the deployment.
 *
 * Four properties, all deliberate:
 *
 *   1. THE SALT COMMITS TO THE CREATOR. `salt = keccak256(creator, userSalt)`,
 *      and the token's parameters are constructor arguments, so they are inside
 *      the init code the address hashes. Nobody can occupy an address somebody
 *      else was shown, and nobody can occupy it with different parameters.
 *   2. ANYONE MAY DEPLOY. `createToken` is open. §22 — the platform holds
 *      nothing here, so there is nothing to verify and no gate to apply. Who
 *      may *use the INTAFACED surface* to launch is a product question the API
 *      answers; who may use this contract is nobody's decision to make.
 *   3. THE FACTORY KEEPS NOTHING. It has no owner, holds no balance, and takes
 *      no fee. A launch fee is a Fiat Plane ledger recipe (§0.6) and belongs in
 *      the module that charges it — never in a contract that would then be
 *      holding value outside the ledger.
 *   4. A COLLISION REVERTS. See `TokenAlreadyDeployed` below; this is where the
 *      factory deliberately differs from `AccountFactory`.
 *
 * `services/svc-protocol/src/launch/address.ts` re-derives the same address in
 * TypeScript, and `src/launch/token-factory-onchain.test.ts` asks this contract
 * whether it agrees.
 */
contract TokenFactory {
    /**
     * The full parameter set. Every field is a constructor argument of
     * `SovereignToken`, which is why every field changes the address.
     */
    struct TokenParams {
        string name;
        string symbol;
        uint8 decimals;
        uint256 totalSupply;
        /** Receives the entire supply at construction. */
        address recipient;
    }

    /**
     * Bounds that exist on chain and not only in the API.
     *
     * The API validates these too, and the API is not the authority: anyone can
     * call this contract directly. Unbounded strings are a griefing surface for
     * every indexer that will read `TokenCreated`, and `decimals > 18` produces
     * a token that cannot round-trip through the ledger's `numeric(38,18)`.
     */
    uint8 public constant MAX_DECIMALS = 18;
    uint256 public constant MAX_NAME_BYTES = 64;
    uint256 public constant MAX_SYMBOL_BYTES = 16;

    /**
     * Who deployed a token through this factory. `address(0)` means "not this
     * factory" — the provenance §35 (deployer reputation) needs, recorded at
     * the moment it is true rather than reconstructed from logs later.
     */
    mapping(address token => address creator) public creatorOf;

    event TokenCreated(
        address indexed token,
        address indexed creator,
        address indexed recipient,
        string name,
        string symbol,
        uint8 decimals,
        uint256 totalSupply
    );

    error NameRequired();
    error SymbolRequired();
    error DecimalsTooHigh(uint8 decimals);
    error SupplyRequired();
    error RecipientRequired();
    error TokenAlreadyDeployed(address token);
    error DeploymentFailed();

    /**
     * Deploy the token. `msg.sender` is the creator and is bound into the salt,
     * so the caller cannot deploy at an address derived for somebody else.
     *
     * ── Why this reverts where `AccountFactory.createAccount` returns ────────
     *
     * A repeated `createAccount` is idempotent: the account already exists, it
     * is the same account, and a relayer racing itself is normal. A repeated
     * `createToken` is not the same situation. The supply was already minted to
     * the recipient by the first call; returning the existing address quietly
     * would let a caller — and any UI reading the return value — believe a
     * second launch happened and a second supply exists. Naming the collision
     * is the only answer that cannot be misread.
     */
    function createToken(bytes32 userSalt, TokenParams calldata params) external returns (address token) {
        _validate(params);

        token = getAddress(msg.sender, userSalt, params);
        if (token.code.length > 0) revert TokenAlreadyDeployed(token);

        address deployed = address(
            new SovereignToken{salt: _salt(msg.sender, userSalt)}(
                params.name,
                params.symbol,
                params.decimals,
                params.totalSupply,
                params.recipient
            )
        );
        // Belt and braces: `new ... {salt:}` already reverts on a collision, so
        // this only fires if the prediction below and the EVM ever disagree —
        // which is the failure that would put a user's funds at an address the
        // factory will never deploy to.
        if (deployed != token) revert DeploymentFailed();

        creatorOf[deployed] = msg.sender;

        emit TokenCreated(deployed, msg.sender, params.recipient, params.name, params.symbol, params.decimals, params.totalSupply);
        return deployed;
    }

    /** The address these parameters will land at, whether or not anything is deployed. */
    function getAddress(address creator, bytes32 userSalt, TokenParams memory params) public view returns (address) {
        bytes32 initCodeHash = keccak256(initCode(params));
        return
            address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), _salt(creator, userSalt), initCodeHash))))
            );
    }

    function isDeployed(address creator, bytes32 userSalt, TokenParams memory params) external view returns (bool) {
        return getAddress(creator, userSalt, params).code.length > 0;
    }

    /**
     * The exact bytes CREATE2 hashes: the template's creation code followed by
     * its ABI-encoded constructor arguments.
     *
     * Exposed as a view rather than kept private because `address.ts` builds
     * the identical bytes off chain, and a test that can ask the contract for
     * its own answer catches a drift in the encoding directly, instead of
     * inferring it from an address that came out wrong.
     */
    function initCode(TokenParams memory params) public pure returns (bytes memory) {
        return
            abi.encodePacked(
                type(SovereignToken).creationCode,
                abi.encode(params.name, params.symbol, params.decimals, params.totalSupply, params.recipient)
            );
    }

    /** Binding the creator into the salt is what makes a predicted address safe to publish. */
    function _salt(address creator, bytes32 userSalt) internal pure returns (bytes32) {
        return keccak256(abi.encode(creator, userSalt));
    }

    function _validate(TokenParams calldata params) private pure {
        uint256 nameLength = bytes(params.name).length;
        if (nameLength == 0 || nameLength > MAX_NAME_BYTES) revert NameRequired();

        uint256 symbolLength = bytes(params.symbol).length;
        if (symbolLength == 0 || symbolLength > MAX_SYMBOL_BYTES) revert SymbolRequired();

        if (params.decimals > MAX_DECIMALS) revert DecimalsTooHigh(params.decimals);
        // Duplicated from the token's own constructor on purpose: reverting
        // here costs the caller far less gas than reverting inside a CREATE2,
        // and a factory that lets an invalid deployment start is a factory
        // whose `getAddress` answers for tokens that can never exist.
        if (params.totalSupply == 0) revert SupplyRequired();
        if (params.recipient == address(0)) revert RecipientRequired();
    }
}
