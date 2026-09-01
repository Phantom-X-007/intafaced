'use strict';

var freshness = require('./chart-freshness.js');
var fs = require('fs');
var path = require('path');
var failed = 0;
function assert(value, name) {
  if (!value) {
    failed += 1;
    console.error('FAIL:', name);
  } else {
    console.log('ok:', name);
  }
}

var fence = freshness.createLatestRequestFence();
var first = fence.begin();
var second = fence.begin();
assert(!fence.isCurrent(first), 'older response is superseded');
assert(fence.isCurrent(second), 'latest response is current');
fence.dispose();
assert(!fence.isCurrent(second), 'disposed chart accepts no response');

var ok = freshness.snapshotState('ok', [{ time: 1 }, { time: 1725000000 }]);
assert(ok.source === 'svc-trade REST snapshot' && ok.live === false, 'snapshot never claims live');
assert(ok.latestCandleTimeMs === 1725000000000, 'latest candle time comes from service data');
assert(freshness.snapshotState('empty', []).latestCandleTimeMs === null, 'empty has no invented as-of');
assert(freshness.snapshotState('failed', [{ time: 1 }]).latestCandleTimeMs === null, 'failure has no stale as-of');
assert(freshness.latestCandleTimeMs([{ time: '1725' }]) === null, 'string timestamp is refused');

var kline = fs.readFileSync(path.join(__dirname, 'kline.js'), 'utf8');
var exchange = fs.readFileSync(path.join(__dirname, '../../../pages/exchange/Exchange.vue'), 'utf8');
assert(kline.indexOf('self._historyFence.isCurrent(requestId)') >= 0, 'history callbacks are request-fenced');
assert(kline.indexOf("resolve('superseded')") >= 0, 'older history response is named superseded');
assert(kline.indexOf('requestedResolution') >= 0 && kline.indexOf('requestedSymbol') >= 0, 'request identity captures pair and interval');
assert(exchange.indexOf("status === 'superseded'") >= 0, 'superseded promise cannot overwrite desk status');
assert(exchange.indexOf('svc-trade REST snapshot') >= 0 && exchange.indexOf('· not live') >= 0, 'desk labels snapshot source and non-live state');

if (failed) process.exit(1);
console.log('\nchart-freshness.golden: all passed');
