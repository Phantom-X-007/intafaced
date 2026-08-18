// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LaunchLpLock} from "./LaunchLpLock.sol";
import {LaunchVesting} from "./LaunchVesting.sol";

/**
 * DEPLOYER REPUTATION — Protocol Plane (board S-L4 / §35).
 *
 * Raw on-chain counts only. Empty history is zeros — that is NO score, not a
 * clean badge. This contract has no `isSafe` / `isTrusted` / `score` that could
 * render absence as assurance.
 */
contract DeployerReputation {
    struct Facts {
        uint32 lpLocks;
        uint32 vestings;
    }

    mapping(address => Facts) public facts;
    mapping(address => bool) public notedLock;
    mapping(address => bool) public notedVesting;

    event LockNoted(address indexed beneficiary, address lock);
    event VestingNoted(address indexed beneficiary, address vesting);

    error AlreadyNoted();
    error BadTarget();

    function registerLock(address lock) external {
        if (notedLock[lock]) revert AlreadyNoted();
        address beneficiary = LaunchLpLock(lock).beneficiary();
        uint64 unlockTime = LaunchLpLock(lock).unlockTime();
        if (beneficiary == address(0) || unlockTime == 0) revert BadTarget();
        notedLock[lock] = true;
        facts[beneficiary].lpLocks += 1;
        emit LockNoted(beneficiary, lock);
    }

    function registerVesting(address vesting) external {
        if (notedVesting[vesting]) revert AlreadyNoted();
        address beneficiary = LaunchVesting(vesting).beneficiary();
        uint256 total = LaunchVesting(vesting).total();
        if (beneficiary == address(0) || total == 0) revert BadTarget();
        notedVesting[vesting] = true;
        facts[beneficiary].vestings += 1;
        emit VestingNoted(beneficiary, vesting);
    }
}
