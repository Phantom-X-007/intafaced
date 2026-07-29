/**
 * @intafaced/market-data — the shared market-data core.
 *
 * Pure, and deliberately so: the server computes deltas with `diffDepth` and
 * the browser applies them with `applyDelta`, from the same code. A book that
 * two implementations agree on is a book that cannot disagree with itself.
 *
 * Trade prints are the other half of the public feed: one shape built from
 * `orderFilled`, with order ids stripped before they can touch a public wire.
 */
export * from './depth.js';
export * from './trade.js';
