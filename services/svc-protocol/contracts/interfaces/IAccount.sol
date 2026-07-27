// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * ERC-4337 v0.7 account interface (the packed user operation shape).
 *
 * Declared here rather than pulled from a package so the Protocol Plane's
 * contract suite has no external dependency it does not read: an account that
 * holds a user's entire net worth should not inherit code nobody in this repo
 * has opened.
 */
struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    /** verificationGasLimit (high 128) ++ callGasLimit (low 128). */
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    /** maxPriorityFeePerGas (high 128) ++ maxFeePerGas (low 128). */
    bytes32 gasFees;
    bytes paymasterAndData;
    bytes signature;
}

interface IAccount {
    /**
     * Called by the EntryPoint before execution.
     *
     * Returns packed validation data:
     *   authorizer (20 bytes, 0 = valid, 1 = signature failure)
     *   ++ validUntil (6 bytes) ++ validAfter (6 bytes)
     *
     * The time range matters here more than in most accounts: it is how a
     * session key's expiry is enforced by the EntryPoint itself, not only by
     * our own code.
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData);
}

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4 magicValue);
}
