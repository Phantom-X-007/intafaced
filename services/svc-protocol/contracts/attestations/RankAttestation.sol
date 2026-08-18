// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * RANK ATTESTATION — Protocol Plane (board S-F1 / §19 / tracker `blueprint.attestations`).
 *
 * On-chain standing without identity. The subject is a `bytes32 commitment`
 * the holder chose (typically keccak256 of a user-chosen salt). There is no
 * address, name, email, user id, or KYC field on this contract. Joining an
 * attestation to a Fiat Plane person is forbidden.
 *
 * Anyone may attest (permissionless). There is no platform issuer. Consumers
 * decide off-chain which issuer addresses they trust. `revoke` is issuer-only:
 * `msg.sender` can only clear their own record for a commitment.
 *
 * Unaffected: Fiat/blueprint card refuse (Denon, svc-blueprint). Unaudited.
 */
contract RankAttestation {
    /// Discrete rank band. A cap so a garbage uint64 cannot masquerade as standing.
    uint64 public constant MAX_RANK = 1_000_000;

    struct Record {
        uint64 rank;
        uint64 issuedAt;
        uint64 expiresAt;
        bytes32 schemaId;
    }

    /// commitment → issuer → record. Zero `issuedAt` means no live attestation.
    mapping(bytes32 => mapping(address => Record)) public attestations;

    event Attested(bytes32 indexed commitment, address indexed issuer, uint64 rank, uint64 expiresAt, bytes32 schemaId);
    event Revoked(bytes32 indexed commitment, address indexed issuer);

    error ZeroCommitment();
    error ExpiryInThePast();
    error RankOverflow();
    error NotIssuer();

    /**
     * Write a rank attestation for `commitment`. Issuer is always `msg.sender`.
     * Overwrites that issuer's previous record for the same commitment.
     */
    function attest(bytes32 commitment, uint64 rank, uint64 expiresAt, bytes32 schemaId) external {
        if (commitment == bytes32(0)) revert ZeroCommitment();
        if (expiresAt <= block.timestamp) revert ExpiryInThePast();
        if (rank > MAX_RANK) revert RankOverflow();

        attestations[commitment][msg.sender] = Record({
            rank: rank,
            issuedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            schemaId: schemaId
        });
        emit Attested(commitment, msg.sender, rank, expiresAt, schemaId);
    }

    /**
     * Clear `msg.sender`'s attestation for `commitment`. Other issuers are
     * untouched. Reverts if this issuer has nothing to revoke.
     */
    function revoke(bytes32 commitment) external {
        Record storage rec = attestations[commitment][msg.sender];
        if (rec.issuedAt == 0) revert NotIssuer();
        delete attestations[commitment][msg.sender];
        emit Revoked(commitment, msg.sender);
    }
}
