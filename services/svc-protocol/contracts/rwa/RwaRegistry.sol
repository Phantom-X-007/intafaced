// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * RWA ISSUANCE REGISTRY — Protocol Plane (board S-G4 / tracker `launch.rwa`).
 *
 * Licence-gated honesty, same shape as TreasuryYieldVault: a zero licence hash
 * refuses every write. The hash is immutable. This contract does not store a
 * jurisdiction, a coupon, a partner name, or a compliance flag — those are
 * licence *content*, and that content is Class X (Nitro human / counsel).
 *
 * `register` is permissionless once the hash is set. The issuer is always
 * `msg.sender`. There is no platform admin, no pause that freezes a listed
 * token, and no upgrade. Unlisting is the issuer's own call; the platform
 * cannot seize a listing.
 *
 * Unaudited. Do not deploy onto a chain holding real value until
 * `socket.contract-audit` is a paid external package.
 */
contract RwaRegistry {
    bytes32 public immutable licenceHash;

    struct Issuance {
        address token;
        bytes32 assetCommitment;
        address issuer;
        bool listed;
    }

    mapping(address => Issuance) public byToken;

    error LicenceUnset();
    error BadConfig();
    error AlreadyListed();
    error NotIssuer();
    error NotListed();

    event Registered(address indexed token, bytes32 indexed assetCommitment, address indexed issuer);
    event Unlisted(address indexed token, address indexed issuer);

    constructor(bytes32 licenceHash_) {
        licenceHash = licenceHash_;
    }

    function register(address token, bytes32 assetCommitment) external {
        if (licenceHash == bytes32(0)) revert LicenceUnset();
        if (token == address(0) || assetCommitment == bytes32(0)) revert BadConfig();
        if (byToken[token].listed) revert AlreadyListed();
        byToken[token] = Issuance({token: token, assetCommitment: assetCommitment, issuer: msg.sender, listed: true});
        emit Registered(token, assetCommitment, msg.sender);
    }

    function unlist(address token) external {
        if (licenceHash == bytes32(0)) revert LicenceUnset();
        Issuance storage row = byToken[token];
        if (!row.listed) revert NotListed();
        if (row.issuer != msg.sender) revert NotIssuer();
        row.listed = false;
        emit Unlisted(token, msg.sender);
    }
}
