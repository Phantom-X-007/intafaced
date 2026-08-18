// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * STEALTH ANNOUNCER — Protocol Plane (board S-L3 / §26).
 *
 * On-chain half of unlinkable receive: a sender publishes an announcement
 * that only the intended recipient can recognise. There is no user id, no
 * profile handle, and no platform key. Indexers must treat these logs as
 * aggregate activity — joining them to a Fiat Plane person is forbidden.
 *
 * Address derivation lives off-chain (`src/stealth/presentation.ts`).
 */
contract StealthAnnouncer {
    event Announcement(uint256 indexed schemeId, address indexed stealthAddress, bytes ephemeralPubKey, bytes metadata);

    error BadAnnouncement();

    function announce(uint256 schemeId, address stealthAddress_, bytes calldata ephemeralPubKey, bytes calldata metadata) external {
        if (stealthAddress_ == address(0) || ephemeralPubKey.length == 0) revert BadAnnouncement();
        emit Announcement(schemeId, stealthAddress_, ephemeralPubKey, metadata);
    }
}
