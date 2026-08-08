// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceOracle} from "./IPriceOracle.sol";

/**
 * PRICE ORACLE — Protocol Plane (board S-A12 / `socket.price-oracle`).
 *
 * Two independent push sources. A mark is returned ONLY when:
 *   · both sources have reported for the asset
 *   · both reports are within `stalenessBound`
 *   · |a-b|/min(a,b) <= `maxDisagreementBps`
 *
 * Disagreement or staleness reverts. There is no fallback price and no AMM read.
 * Per SPEC-LENDING §1: never price from our own pool.
 */
contract FailClosedOracle is IPriceOracle {
    struct Report {
        uint256 priceWad;
        uint64 updatedAt;
    }

    address public immutable reporterA;
    address public immutable reporterB;
    uint32 public immutable stalenessBound;
    uint16 public immutable maxDisagreementBps;

    mapping(address asset => Report) public feedA;
    mapping(address asset => Report) public feedB;

    event Reported(address indexed reporter, address indexed asset, uint256 priceWad, uint64 updatedAt);

    error BadConfig();
    error NotReporter();
    error BadPrice();
    error Stale();
    error Disagreement();
    error MissingReport();

    constructor(address reporterA_, address reporterB_, uint32 stalenessBound_, uint16 maxDisagreementBps_) {
        if (reporterA_ == address(0) || reporterB_ == address(0) || reporterA_ == reporterB_) revert BadConfig();
        if (stalenessBound_ == 0) revert BadConfig();
        if (maxDisagreementBps_ == 0 || maxDisagreementBps_ > 10_000) revert BadConfig();
        reporterA = reporterA_;
        reporterB = reporterB_;
        stalenessBound = stalenessBound_;
        maxDisagreementBps = maxDisagreementBps_;
    }

    function report(address asset, uint256 priceWad) external {
        if (asset == address(0) || priceWad == 0) revert BadPrice();
        Report memory r = Report({priceWad: priceWad, updatedAt: uint64(block.timestamp)});
        if (msg.sender == reporterA) {
            feedA[asset] = r;
        } else if (msg.sender == reporterB) {
            feedB[asset] = r;
        } else {
            revert NotReporter();
        }
        emit Reported(msg.sender, asset, priceWad, r.updatedAt);
    }

    function getMark(address asset) external view returns (uint256 priceWad, uint64 updatedAt) {
        Report memory a = feedA[asset];
        Report memory b = feedB[asset];
        if (a.updatedAt == 0 || b.updatedAt == 0) revert MissingReport();

        uint64 nowTs = uint64(block.timestamp);
        if (nowTs - a.updatedAt > stalenessBound || nowTs - b.updatedAt > stalenessBound) revert Stale();

        uint256 lo = a.priceWad < b.priceWad ? a.priceWad : b.priceWad;
        uint256 hi = a.priceWad < b.priceWad ? b.priceWad : a.priceWad;
        // disagreement bps vs the lower price (conservative)
        uint256 diffBps = ((hi - lo) * 10_000) / lo;
        if (diffBps > maxDisagreementBps) revert Disagreement();

        // Conservative mark: min of the two fresh agreeing prices.
        priceWad = lo;
        updatedAt = a.updatedAt < b.updatedAt ? a.updatedAt : b.updatedAt;
    }
}
