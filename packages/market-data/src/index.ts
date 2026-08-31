/**
 * @intafaced/market-data — the shared market-data core.
 *
 * Pure, and deliberately so: the server computes deltas with `diffDepth` and
 * the browser applies them with `applyDelta`, from the same code. A book that
 * two implementations agree on is a book that cannot disagree with itself.
 *
 * Trade prints are the other half of the public feed: one shape built from
 * `orderFilled`, with order ids stripped and disclosure `kind` required
 * (`unknown` when the source did not say). Kind is never inferred from L2.
 */
export * from './depth.js';
export * from './depth-policy.js';
export * from './trade.js';
export { CaptureLog, bookLevelsFromCapture, classifyBookObservation, isAbsentCapture, isMeasuredBook } from '@intafaced/connect-data-lake';
