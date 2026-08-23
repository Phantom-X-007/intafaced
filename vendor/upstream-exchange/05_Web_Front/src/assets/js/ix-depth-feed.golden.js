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

/* ── feedLive honesty: Live only after snapshot, never bare onopen ───── */

function MockWS(url) {
  this.url = url;
  this.readyState = 0;
  MockWS.last = this;
}
MockWS.last = null;
MockWS.prototype = {
  close: function () {
    this.readyState = 3;
    if (typeof this.onclose === 'function') this.onclose({});
  }
};

var liveFlags = [];
var statuses = [];
var handle = feed.createDepthFeed({
  marketId: 'm-live',
  onBook: function () {},
  onLive: function (v) {
    liveFlags.push(!!v);
  },
  onStatus: function (s) {
    statuses.push(s);
  },
  WebSocketImpl: MockWS,
  fetchImpl: function () {
    return Promise.reject(new Error('no fetch in golden'));
  }
});

assert(MockWS.last != null, 'socket constructed');
/* Open TCP — must NOT claim live. */
if (typeof MockWS.last.onopen === 'function') MockWS.last.onopen({});
assert(liveFlags.indexOf(true) === -1, 'onopen alone never sets live');
assert(statuses.indexOf('open') !== -1, 'onopen records open status');

/* First snapshot → live. */
if (typeof MockWS.last.onmessage === 'function') {
  MockWS.last.onmessage({
    data: JSON.stringify({
      type: 'snapshot',
      marketId: 'm-live',
      sequence: 1,
      bids: [['10', '1']],
      asks: [['11', '1']]
    })
  });
}
assert(liveFlags[liveFlags.length - 1] === true, 'snapshot sets live');

/* Close → not live. */
if (typeof MockWS.last.onclose === 'function') MockWS.last.onclose({});
assert(liveFlags[liveFlags.length - 1] === false, 'close clears live');

handle.stop();
assert(liveFlags[liveFlags.length - 1] === false, 'stop clears live');

/* JSON number levels must not become book prints (same law as REST accept). */
var cold = feed.bookFromSnapshot({
  type: 'snapshot',
  marketId: 'm1',
  sequence: 1,
  bids: [
    [100, 2],
    ['99', '1']
  ],
  asks: [['101', 3]]
});
assert(Object.keys(cold.bids).length === 1 && cold.bids['99'] === '1', 'number bid dropped');

assert(Object.keys(cold.asks).length === 0, 'number ask dropped');

/* Delta applySide must refuse JSON numbers too (not only snapshots). */
var base = feed.bookFromSnapshot({
  type: 'snapshot',
  marketId: 'm-d',
  sequence: 1,
  bids: [['10', '1']],
  asks: [['20', '1']]
});
var d = feed.applyDelta(base, {
  type: 'delta',
  marketId: 'm-d',
  fromSequence: 1,
  sequence: 2,
  bids: [[11, 5], ['12', '3']],
  asks: []
});
assert(d.ok === true, 'delta with mixed types still applies string rows');
assert(d.book.bids['12'] === '3', 'string delta bid kept');
assert(d.book.bids['11'] === undefined, 'number delta bid refused');
assert(d.book.bids['10'] === '1', 'prior string level preserved');

/* Empty snapshot is an empty book — not a zero-price level. */
var hollow = feed.bookFromSnapshot({
  type: 'snapshot',
  marketId: 'm-empty',
  sequence: 0,
  bids: [],
  asks: []
});
assert(Object.keys(hollow.bids).length === 0, 'empty snapshot bids stay empty');
assert(Object.keys(hollow.asks).length === 0, 'empty snapshot asks stay empty');
var hollowPlate = feed.platePayload(hollow);
assert(hollowPlate.bids.length === 0 && hollowPlate.asks.length === 0, 'empty plate has no levels');

/* Sort is decimal, not lexicographic and not parseFloat. */
assert(feed.compareDecimalStrings('9', '10') < 0, '9 < 10 as decimals');
assert(feed.compareDecimalStrings('10', '9') > 0, '10 > 9 as decimals');
assert(feed.compareDecimalStrings('100.05', '100.5') < 0, '100.05 < 100.5');
assert(feed.compareDecimalStrings('1.0', '1.00') === 0, 'trailing zeros equal');
var sorted = feed.levelsFromSide({ '9': '1', '10': '1', '2': '1' }, 'asc');
assert(sorted.length === 3, 'three string levels');
assert(sorted[0][0] === '2' && sorted[1][0] === '9' && sorted[2][0] === '10', 'asks ascend 2,9,10 not 10,2,9');

/* Source law: Number( is sequence only; never parseFloat on price/qty. */
var fs = require('fs');
var src = fs.readFileSync(path.join(__dirname, 'ix-depth-feed.js'), 'utf8');
var stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
assert(stripped.indexOf('parseFloat') === -1, 'no parseFloat in depth-feed code');
assert(stripped.indexOf('parseInt') === -1, 'no parseInt in depth-feed code');
var numberHits = stripped.match(/Number\s*\(/g) || [];
assert(numberHits.length === 3, 'Number( only on snapshot/delta sequence (got ' + numberHits.length + ')');
assert(stripped.indexOf('Number(snapshot.sequence)') !== -1, 'snapshot sequence may Number()');
assert(stripped.indexOf('Number(delta.sequence)') !== -1, 'delta sequence may Number()');
assert(stripped.indexOf('Number(delta.fromSequence)') !== -1, 'fromSequence may Number()');
assert(stripped.indexOf('Number(row') === -1, 'no Number(row) on price/qty');
assert(stripped.indexOf('Number(price') === -1, 'no Number(price)');
assert(stripped.indexOf('Number(qty') === -1, 'no Number(qty)');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('ix-depth-feed.golden: ok');
process.exit(0);
