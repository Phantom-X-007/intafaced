// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * S-E3 — on-chain seam a card issuer may drive. No issuer key lives here.
 *
 * The custodial `CardIssuerAdapter` in svc-bank is a different port (issue /
 * authorise / PAN never enters this repo). This interface is the Protocol
 * Plane half: exact pull + kill on the user's SmartAccount program.
 *
 * `CardPull` implements this. The issuer is not a Solidity role.
 */
interface ICardPull {
    function owner() external view returns (address);

    function token() external view returns (address);

    function settlement() external view returns (address);

    function killed() external view returns (bool);

    function pullExact(uint256 amount) external;

    function setSettlement(address settlement_) external;

    function kill() external;
}
