// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/** Minimal ERC-20 surface the AMM / router need. No platform token privileged. */
interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}
