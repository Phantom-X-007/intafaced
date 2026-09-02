// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Minimal} from "../amm/IERC20Minimal.sol";
import {ICardPull} from "../interfaces/ICardPull.sol";

/**
 * JIT CARD PULL — Protocol Plane (board S-E1 / §18).
 *
 * At authorisation the user's SmartAccount pulls an exact amount to a
 * settlement address the *user* chose. This contract never holds the tokens:
 * `pullExact` is `transferFrom(owner, settlement, amount)`. The issuer is not
 * a privileged role and has no path to the balance.
 *
 * `owner` is the user's SmartAccount (constructor). A session key may call
 * `pullExact` because that selector is not an outbound ERC-20 transfer — the
 * account already approved this contract; the session cannot `transfer` or
 * `approve` on its own.
 *
 * `kill` is owner-only. After kill, pulls refuse. Tokens stay in the
 * SmartAccount (this contract's balance is always zero). Program kill strands
 * nothing.
 *
 * No pause, no upgrade, no issuer key, no invented FX. Unaudited.
 *
 * S-E3: this contract is the `ICardPull` implementation. A live issuer talks
 * to these selectors; it does not receive a key from this repo.
 */
contract CardPull is ICardPull {
    address public immutable owner;
    address public immutable token;
    address public settlement;
    bool public killed;

    error NotOwner();
    error ProgramKilled();
    error BadConfig();
    error BadAmount();
    error TransferFailed();

    event SettlementSet(address indexed settlement);
    event Pulled(address indexed from, address indexed to, uint256 amount);
    event Killed(address indexed owner);

    constructor(address owner_, address token_, address settlement_) {
        if (owner_ == address(0) || token_ == address(0) || settlement_ == address(0)) revert BadConfig();
        owner = owner_;
        token = token_;
        settlement = settlement_;
        emit SettlementSet(settlement_);
    }

    function setSettlement(address settlement_) external {
        if (msg.sender != owner) revert NotOwner();
        if (killed) revert ProgramKilled();
        if (settlement_ == address(0)) revert BadConfig();
        settlement = settlement_;
        emit SettlementSet(settlement_);
    }

    function pullExact(uint256 amount) external {
        if (killed) revert ProgramKilled();
        if (msg.sender != owner) revert NotOwner();
        if (amount == 0) revert BadAmount();
        if (!IERC20Minimal(token).transferFrom(owner, settlement, amount)) revert TransferFailed();
        emit Pulled(owner, settlement, amount);
    }

    function kill() external {
        if (msg.sender != owner) revert NotOwner();
        killed = true;
        emit Killed(owner);
    }
}
