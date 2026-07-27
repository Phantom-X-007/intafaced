// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SmartAccount} from "./SmartAccount.sol";

/**
 * ACCOUNT FACTORY — deterministic, permissionless, non-authorising.
 *
 * Deploys SmartAccount instances as EIP-1167 minimal proxies via CREATE2, so an
 * address is known before the account exists. That is what lets a user be shown
 * their address during onboarding, receive a deposit at it, and only pay for
 * deployment when they first transact (§17.4 "zero seed-phrase wall").
 *
 * Three properties, all deliberate:
 *
 *   1. THE SALT COMMITS TO THE OWNER. `salt = keccak256(owner, userSalt)`, so
 *      the address is a function of the owner key. Nobody can deploy an account
 *      they control at somebody else's predicted address, which is what makes
 *      it safe to fund an address before it has code.
 *   2. ANYONE MAY DEPLOY. `createAccount` is open. A relayer paying gas for a
 *      user is doing bookkeeping, not granting itself anything — the owner is
 *      an argument, and the argument is bound into the address.
 *   3. THE IMPLEMENTATION IS IMMUTABLE AND SO IS EVERY CLONE. There is no
 *      registry to re-point, no beacon, no admin. An EIP-1167 clone hard-codes
 *      the implementation address in its own runtime bytecode. The only way to
 *      change the code behind an account is to not be that account.
 *
 * `services/svc-protocol/src/accounts/address.ts` re-derives the same address in
 * TypeScript from the EIP-1167 creation code, and its tests pin the byte layout.
 */
contract AccountFactory {
    /** The one SmartAccount every clone delegates to, forever. */
    address public immutable implementation;

    event AccountCreated(address indexed account, address indexed owner, bytes32 indexed userSalt);

    error ImplementationRequired();
    error OwnerRequired();
    error DeploymentFailed();

    constructor(address implementation_) {
        if (implementation_ == address(0)) revert ImplementationRequired();
        implementation = implementation_;
    }

    /**
     * Deploy the account for `owner`. Idempotent: if it already exists, the
     * existing address comes back rather than reverting, because a relayer
     * racing itself is normal and should not be an error a user sees.
     */
    function createAccount(address owner, bytes32 userSalt) external returns (address account) {
        if (owner == address(0)) revert OwnerRequired();

        account = getAddress(owner, userSalt);
        if (account.code.length > 0) return account;

        address deployed = _cloneDeterministic(implementation, _salt(owner, userSalt));
        if (deployed != account) revert DeploymentFailed();

        SmartAccount(payable(deployed)).initialize(owner);
        emit AccountCreated(deployed, owner, userSalt);
        return deployed;
    }

    /** The address `owner` will have, whether or not it has been deployed. */
    function getAddress(address owner, bytes32 userSalt) public view returns (address) {
        return _predictDeterministic(implementation, _salt(owner, userSalt), address(this));
    }

    function isDeployed(address owner, bytes32 userSalt) external view returns (bool) {
        return getAddress(owner, userSalt).code.length > 0;
    }

    /** Binding the owner into the salt is what makes a predicted address safe to fund. */
    function _salt(address owner, bytes32 userSalt) internal pure returns (bytes32) {
        return keccak256(abi.encode(owner, userSalt));
    }

    // ── EIP-1167 (vendored, not imported) ───────────────────────────────────
    //
    // Creation code, 55 bytes:
    //   3d602d80600a3d3981f3  363d3d373d3d3d363d73 <impl:20> 5af43d82803e903d91602b57fd5bf3
    //   └ constructor ──────┘ └ runtime ─────────────────────────────────────────────────┘
    //
    // Copied from the reference implementation rather than imported so that
    // every byte an INTAFACED account is built from is in this repository.

    function _cloneDeterministic(address impl, bytes32 salt) private returns (address instance) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, impl))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            instance := create2(0, ptr, 0x37, salt)
        }
        if (instance == address(0)) revert DeploymentFailed();
    }

    function _predictDeterministic(address impl, bytes32 salt, address deployer) private pure returns (address predicted) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, impl))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf3ff00000000000000000000000000000000)
            mstore(add(ptr, 0x38), shl(0x60, deployer))
            mstore(add(ptr, 0x4c), salt)
            mstore(add(ptr, 0x6c), keccak256(ptr, 0x37))
            predicted := keccak256(add(ptr, 0x37), 0x55)
        }
    }
}
