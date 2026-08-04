/**
 * Node golden tests for ix-depth-feed (no browser WebSocket).
 * Run: node src/assets/js/ix-depth-feed.golden.js
 */
'use strict';

var path = require('path');
var feed = require(path.join(__dirname, 'ix-depth-feed.js'));
var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  }
}

var book = feed.bookFromSnapshot({
  type: 'snapshot',
  marketId: 'm1',
  sequence: 1,
  bids: [['100', '2']],
  asks: [['101', '1']]
});
assert(book.sequence === 1, 'snapshot sequence');
assert(book.bids['100'] === '2', 'snapshot bid');

var ok = feed.applyDelta(book, {
  type: 'delta',
  marketId: 'm1',
  fromSequence: 1,
  sequence: 2,
  bids: [['100', '0'], ['99', '3']],
  asks: []
});
assert(ok.ok === true, 'delta applies');
assert(ok.book.bids['100'] === undefined, 'zero removes level');
assert(ok.book.bids['99'] === '3', 'new bid');
assert(ok.book.sequence === 2, 'seq advanced');

var gap = feed.applyDelta(ok.book, {
  type: 'delta',
  marketId: 'm1',
  fromSequence: 9,
  sequence: 10,
  bids: [],
  asks: []
});
assert(gap.ok === false && gap.reason === 'gap', 'gap refused');

var plate = feed.platePayload(ok.book);
assert(Array.isArray(plate.bids) && plate.bids[0][0] === '99', 'plate bids');
assert(feed.streamUrl('abc').indexOf('/ws/stream?market=abc') !== -1, 'stream url');
assert(feed.resnapshotUrl('abc') === '/ws/markets/abc/depth', 'resnapshot url');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('ix-depth-feed.golden: ok');
process.exit(0);
