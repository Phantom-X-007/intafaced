// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Minimal} from "../amm/IERC20Minimal.sol";

/**
 * LAUNCH LP LOCK — Protocol Plane (board S-L4 / §35 trust layer, LP leg).
 *
 * LP tokens locked until unlockTime. Early withdraw is impossible.
 * Badge-false promises cannot be represented: there is no admin unlock.
 */
contract LaunchLpLock {
    address public immutable lpToken;
    address public immutable beneficiary;
    uint64 public immutable unlockTime;
    uint256 public locked;

    event Locked(uint256 amount);
    event Claimed(uint256 amount);

    error BadConfig();
    error BadAmount();
    error LockedStill();
    error TransferFailed();

    constructor(address lpToken_, address beneficiary_, uint64 unlockTime_) {
        if (lpToken_ == address(0) || beneficiary_ == address(0)) revert BadConfig();
        if (unlockTime_ <= block.timestamp) revert BadConfig();
        lpToken = lpToken_;
        beneficiary = beneficiary_;
        unlockTime = unlockTime_;
    }

    function lock(uint256 amount) external {
        if (amount == 0) revert BadAmount();
        if (!IERC20Minimal(lpToken).transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        locked += amount;
        emit Locked(amount);
    }

    function claim() external {
        if (block.timestamp < unlockTime) revert LockedStill();
        uint256 amount = locked;
        if (amount == 0) revert BadAmount();
        locked = 0;
        if (!IERC20Minimal(lpToken).transfer(beneficiary, amount)) revert TransferFailed();
        emit Claimed(amount);
    }
}
