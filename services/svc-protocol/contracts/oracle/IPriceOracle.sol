// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Fail-closed mark oracle (S-A12 / SPEC-LENDING §1).
 * Implementations MUST revert rather than invent or average through disagreement.
 */
interface IPriceOracle {
    /**
     * @return priceWad Price of one whole unit of `asset` in quote units, 1e18-scaled.
     * @return updatedAt Unix timestamp of the mark used.
     */
    function getMark(address asset) external view returns (uint256 priceWad, uint64 updatedAt);
}
