// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Minimal} from "../amm/IERC20Minimal.sol";

/**
 * TREASURY YIELD VAULT — Protocol Plane (board S-L5 / §36).
 *
 * Contract half of tokenised T-bill yield. Deposits are refuse-closed until
 * the deployer supplies a non-zero licence hash at construction. The hash is
 * immutable: the platform cannot later "turn yield on" with an admin key.
 *
 * The licence *content* is Class X (Nitro human / counsel). This contract
 * does not invent a jurisdiction or a coupon.
 */
contract TreasuryYieldVault {
    address public immutable owner;
    address public immutable token;
    bytes32 public immutable licenceHash;

    error NotOwner();
    error LicenceUnset();
    error BadConfig();
    error BadAmount();
    error TransferFailed();

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(address token_, bytes32 licenceHash_) {
        if (token_ == address(0)) revert BadConfig();
        owner = msg.sender;
        token = token_;
        licenceHash = licenceHash_;
    }

    function deposit(uint256 amount) external {
        if (licenceHash == bytes32(0)) revert LicenceUnset();
        if (amount == 0) revert BadAmount();
        if (!IERC20Minimal(token).transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        if (licenceHash == bytes32(0)) revert LicenceUnset();
        if (amount == 0) revert BadAmount();
        if (!IERC20Minimal(token).transfer(owner, amount)) revert TransferFailed();
        emit Withdrawn(owner, amount);
    }
}
