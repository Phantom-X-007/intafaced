// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Minimal} from "../amm/IERC20Minimal.sol";

/**
 * LAUNCH VESTING — Protocol Plane (board S-L4 / §35 trust layer, vesting leg).
 *
 * Tokens are held by this contract. Release is a function of time only.
 * There is no admin, no revoke, no early unlock. A listing that promised a
 * vest this contract does not enforce cannot be proven from this bytecode.
 */
contract LaunchVesting {
    address public immutable token;
    address public immutable beneficiary;
    uint64 public immutable start;
    uint64 public immutable cliff;
    uint64 public immutable duration;
    uint256 public immutable total;
    uint256 public claimed;

    event Claimed(uint256 amount);

    error BadConfig();
    error NothingDue();
    error TransferFailed();

    constructor(
        address token_,
        address beneficiary_,
        uint64 start_,
        uint64 cliff_,
        uint64 duration_,
        uint256 total_
    ) {
        if (token_ == address(0) || beneficiary_ == address(0)) revert BadConfig();
        if (start_ == 0 || duration_ == 0 || cliff_ > duration_ || total_ == 0) revert BadConfig();
        token = token_;
        beneficiary = beneficiary_;
        start = start_;
        cliff = cliff_;
        duration = duration_;
        total = total_;
        if (!IERC20Minimal(token_).transferFrom(msg.sender, address(this), total_)) revert TransferFailed();
    }

    function vested(uint64 timestamp) public view returns (uint256) {
        if (timestamp < start + cliff) return 0;
        if (timestamp >= start + duration) return total;
        return (total * uint256(timestamp - start)) / uint256(duration);
    }

    function claim() external {
        uint256 due = vested(uint64(block.timestamp)) - claimed;
        if (due == 0) revert NothingDue();
        claimed += due;
        if (!IERC20Minimal(token).transfer(beneficiary, due)) revert TransferFailed();
        emit Claimed(due);
    }
}
