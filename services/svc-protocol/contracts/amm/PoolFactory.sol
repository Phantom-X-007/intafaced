// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ConstantProductPool} from "./ConstantProductPool.sol";

/**
 * POOL FACTORY — deterministic AMM pool create (§17 / protocol.amm).
 *
 * Anyone may create a pool for a token pair + fee. CREATE2 salt is
 * keccak256(token0, token1, feeBps) so the address is predictable off-chain
 * (svc-protocol `predictPoolAddress`) before deployment — same pattern as
 * AccountFactory for smart accounts.
 *
 * No admin. No allowlist. No platform fee recipient. Fee is per-pool and fixed.
 */
contract PoolFactory {
    event PoolCreated(address indexed token0, address indexed token1, uint16 feeBps, address pool, uint256 index);

    mapping(address => mapping(address => mapping(uint16 => address))) public getPool;
    address[] public allPools;

    error IdenticalTokens();
    error ZeroAddress();
    error PoolExists();

    function allPoolsLength() external view returns (uint256) {
        return allPools.length;
    }

    function predictPoolAddress(address tokenA, address tokenB, uint16 feeBps) external view returns (address pool) {
        (address token0, address token1) = _sort(tokenA, tokenB);
        bytes32 salt = keccak256(abi.encodePacked(token0, token1, feeBps));
        bytes memory bytecode = abi.encodePacked(type(ConstantProductPool).creationCode, abi.encode(token0, token1, feeBps));
        bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode)));
        pool = address(uint160(uint256(hash)));
    }

    function createPool(address tokenA, address tokenB, uint16 feeBps) external returns (address pool) {
        (address token0, address token1) = _sort(tokenA, tokenB);
        if (getPool[token0][token1][feeBps] != address(0)) revert PoolExists();

        bytes32 salt = keccak256(abi.encodePacked(token0, token1, feeBps));
        pool = address(new ConstantProductPool{salt: salt}(token0, token1, feeBps));
        getPool[token0][token1][feeBps] = pool;
        getPool[token1][token0][feeBps] = pool;
        allPools.push(pool);
        emit PoolCreated(token0, token1, feeBps, pool, allPools.length - 1);
    }

    function _sort(address tokenA, address tokenB) private pure returns (address token0, address token1) {
        if (tokenA == tokenB) revert IdenticalTokens();
        if (tokenA == address(0) || tokenB == address(0)) revert ZeroAddress();
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }
}
