// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * ERC-4337 v0.7 `EntryPoint.getUserOpHash` — the formula the canonical
 * EntryPoint at 0x0000000071727De22E5E9d8BAf0edAc6f37da032 runs.
 *
 * `src/chain/userop.ts` recomputes the same hash so the relay can refuse an
 * operation the user did not sign. Until this contract exists, that TypeScript
 * was only checked against itself. If the two disagree, users authorise one
 * operation and the chain executes another (socket.userop-differential-test).
 *
 * This is not a bundler, not a paymaster, and not a deploy of the full
 * EntryPoint. It is the hash function, on chain, so the differential is
 * against Solidity rather than a second TypeScript golden.
 */
contract EntryPointGetUserOpHash {
    struct PackedUserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        bytes32 accountGasLimits;
        uint256 preVerificationGas;
        bytes32 gasFees;
        bytes paymasterAndData;
        bytes signature;
    }

    function getUserOpHash(PackedUserOperation calldata userOp) public view returns (bytes32) {
        return keccak256(abi.encode(innerHash(userOp), address(this), block.chainid));
    }

    function innerHash(PackedUserOperation calldata userOp) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    userOp.sender,
                    userOp.nonce,
                    keccak256(userOp.initCode),
                    keccak256(userOp.callData),
                    userOp.accountGasLimits,
                    userOp.preVerificationGas,
                    userOp.gasFees,
                    keccak256(userOp.paymasterAndData)
                )
            );
    }
}
