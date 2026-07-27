/**
 * @intafaced/venue-adapter — cross-venue liquidity.
 *
 * We are our own broker. This package is how our book competes with, and
 * aggregates, every other venue — behind the §5.2 `LiquiditySource` interface,
 * so the platform never depends on any of them (Doctrine §0.4).
 *
 * Architecture: docs/TERMINAL.md
 */
export * from './source.js';
export * from './router.js';
export * from './consolidated-book.js';
