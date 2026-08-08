// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Minimal} from "../../amm/IERC20Minimal.sol";
import {IsolatedLendingMarket} from "../IsolatedLendingMarket.sol";

/**
 * S-A4 adversarial harness — NOT a product contract.
 *
 * Same-tx open/borrow/repay and reentrancy probes. The market has no flash-loan
 * entrypoint; SPEC §6 still requires "any position opened and closed in one
 * transaction must not extract value" and "reentrancy attempts fail, asserted".
 */
contract LendingSameTxRoundTrip {
    IsolatedLendingMarket public immutable market;
    address public immutable collateral;
    address public immutable borrowToken;

    constructor(IsolatedLendingMarket market_, address collateral_, address borrowToken_) {
        market = market_;
        collateral = collateral_;
        borrowToken = borrowToken_;
    }

    /// Pulls collateral (+ optional borrow top-up) from msg.sender, opens, borrows, repays, returns leftovers.
    function openBorrowRepay(uint256 collateralAmount, uint256 borrowAmount) external {
        require(IERC20Minimal(collateral).transferFrom(msg.sender, address(this), collateralAmount), "col in");
        require(IERC20Minimal(collateral).approve(address(market), collateralAmount), "col approve");
        market.depositCollateral(collateralAmount);
        market.borrow(borrowAmount);

        // Repay with max so share rounding cannot leave dust that blocks withdraw.
        uint256 debt = market.debtOf(address(this));
        uint256 have = IERC20Minimal(borrowToken).balanceOf(address(this));
        if (have < debt) {
            require(IERC20Minimal(borrowToken).transferFrom(msg.sender, address(this), debt - have), "bor topup");
        }
        require(IERC20Minimal(borrowToken).approve(address(market), type(uint256).max), "bor approve");
        market.repay(type(uint256).max);
        require(market.debtOf(address(this)) == 0, "dust debt");

        uint256 leftCol = market.collateralOf(address(this));
        if (leftCol > 0) {
            market.withdrawCollateral(leftCol);
        }
        uint256 colBal = IERC20Minimal(collateral).balanceOf(address(this));
        if (colBal > 0) require(IERC20Minimal(collateral).transfer(msg.sender, colBal), "col out");
        uint256 borBal = IERC20Minimal(borrowToken).balanceOf(address(this));
        if (borBal > 0) require(IERC20Minimal(borrowToken).transfer(msg.sender, borBal), "bor out");
    }
}

/**
 * Borrow-token that tries to reenter `borrow` during the market's outbound transfer.
 */
contract ReenteringBorrowToken {
    string public name = "ReenterBor";
    string public symbol = "REB";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    IsolatedLendingMarket public market;
    bool public armed;
    uint256 public reenterAmount;
    bool public reenterAttempted;
    bool public reenterSucceeded;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function arm(IsolatedLendingMarket market_, uint256 amount) external {
        market = market_;
        reenterAmount = amount;
        armed = true;
        reenterAttempted = false;
        reenterSucceeded = false;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount) private returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        if (armed && address(market) != address(0) && from == address(market) && !reenterAttempted) {
            reenterAttempted = true;
            armed = false;
            try market.borrow(reenterAmount) {
                reenterSucceeded = true;
            } catch {
                reenterSucceeded = false;
            }
        }
        return true;
    }
}
