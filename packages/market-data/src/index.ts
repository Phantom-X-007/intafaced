/**
 * @intafaced/market-data — the shared market-data core.
 *
 * Pure, and deliberately so: the server computes deltas with `diffDepth` and
 * the browser applies them with `applyDelta`, from the same code. A book that
 * two implementations agree on is a book that cannot disagree with itself.
 */
export * from './depth.js';
