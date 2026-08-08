// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * P-256 ECDSA via RIP-7212 (`P256VERIFY` at 0x100).
 *
 * Base / OP-stack and recent anvil expose this precompile. There is no pure-Solidity
 * fallback here on purpose: a multi-hundred-k gas library would be a second crypto
 * stack to audit, and a silent wrong answer is worse than a loud missing precompile.
 *
 * Gas (RIP-7212): verification is on the order of ~3.5k gas when the precompile
 * is present — state that in any PR that claims a passkey owner is cheap enough
 * for retail. Measure on the target rail before treating the number as law.
 *
 * Board: S-A9 · tracker: `socket.p256-verifier`.
 */
library P256 {
    address internal constant VERIFIER = address(0x100);

    /// @dev secp256r1 curve order n.
    uint256 internal constant N =
        0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;

    /// @dev n/2 — reject high-s (malleable) signatures.
    uint256 internal constant HALF_N =
        0x7FFFFFFF800000007FFFFFFFFFFFFFFFDE737D56D38BCF4279DCAE9C032B1A29;

    error P256PrecompileMissing();
    error P256MalleableS();
    error P256InvalidPublicKey();

    /**
     * @param messageHash 32-byte digest the signer committed to (already hashed).
     * @param r Signature r.
     * @param s Signature s (must be ≤ n/2).
     * @param qx Public key x (affine).
     * @param qy Public key y (affine).
     */
    function verify(
        bytes32 messageHash,
        bytes32 r,
        bytes32 s,
        bytes32 qx,
        bytes32 qy
    ) internal view returns (bool) {
        if (uint256(qx) == 0 || uint256(qy) == 0) revert P256InvalidPublicKey();
        if (uint256(s) > HALF_N) revert P256MalleableS();

        // RIP-7212 input: hash || r || s || x || y (160 bytes).
        bytes memory input = abi.encodePacked(messageHash, r, s, qx, qy);
        (bool ok, bytes memory out) = VERIFIER.staticcall(input);
        if (!ok || out.length < 32) revert P256PrecompileMissing();
        return out.length >= 32 && abi.decode(out, (uint256)) == 1;
    }

    /** True when `staticcall(0x100)` does not revert on a structurally valid input shape. */
    function precompilePresent() internal view returns (bool) {
        // Zero hash / zero key — precompile should return 0, not revert, when present.
        bytes memory input = new bytes(160);
        (bool ok, bytes memory out) = VERIFIER.staticcall(input);
        return ok && out.length >= 32;
    }
}
