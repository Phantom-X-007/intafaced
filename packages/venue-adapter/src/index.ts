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
export * from './sor-policy.js';
export * from './best-ex-claim-refuse.js';
export * from './cost-model.js';
export * from './execution-report.js';
export * from './consolidated-book.js';
/** Capture→SOR score feed (D26-P1-X2). Exported here to stay path-disjoint from #1739 `fabric/index.ts`. */
export * from './fabric/capture-routing.js';
/** §27 capture lake runtime + persistence bridge (P-08). */
export { CaptureLake } from './fabric/capture-lake.js';
export { drainFabricCaptureLakeToPersistence } from './fabric/capture-lake-bridge.js';

/**
 * The §27 CONNECT fabric — WS-first sequenced books, per-venue rate governing,
 * live latency grading, cross-venue sanity checking, and the venue adapters.
 *
 * It sits UNDER the router rather than beside it: the fabric decides what a
 * venue is currently worth listening to and expresses that as `VenueHealth`,
 * while the router goes on ranking purely on effective price. Nothing in the
 * fabric can favour our own book, because nothing in it knows which one that is.
 */
export * from './fabric/index.js';
