'use strict';

var feed = require('./ix-candle-feed.js');
var failed = 0;
function assert(value, name) {
  if (!value) { failed += 1; console.error('FAIL:', name); }
  else console.log('ok:', name);
}

var market = 'market-1';
assert(feed.streamUrl(market).indexOf('channel=trades') > 0, 'uses the implemented public trade channel');
assert(feed.acceptTrade({ type: 'trade', marketId: market, sequence: 1, price: '9007199254740993.000000000000000001', quantity: '0.1', ts: '2026-09-02T10:00:00.000Z' }, market), 'accepts exact decimal strings beyond Number');
assert(!feed.acceptTrade({ type: 'trade', marketId: market, sequence: 1, price: 3.5, quantity: '1', ts: '2026-09-02T10:00:00.000Z' }, market), 'refuses numeric money');
assert(!feed.acceptTrade({ type: 'trade', marketId: 'other', sequence: 1, price: '3.5', quantity: '1', ts: '2026-09-02T10:00:00.000Z' }, market), 'refuses the wrong market');
var exact = feed.barFromTrade(null, { price: '9007199254740993.000000000000000001', quantity: '0.000000000000000001', ts: '2026-09-02T10:00:01.000Z' }, 60);
var exact2 = feed.barFromTrade(exact, { price: '9007199254740993.000000000000000002', quantity: '0.000000000000000002', ts: '2026-09-02T10:00:02.000Z' }, 60);
assert(exact2.close.units !== exact.close.units && exact2.volume.units.toString() === '3', 'aggregates exact price and volume beyond Number');

var sockets = [];
var scheduled = [];
var statuses = [];
var prints = [];
var releaseRefresh;
function FakeSocket(url) { this.url = url; sockets.push(this); }
FakeSocket.prototype.close = function () { if (this.onclose) this.onclose(); };
var live = feed.createTradeCandleFeed({
  marketId: market,
  WebSocketImpl: FakeSocket,
  setTimeoutImpl: function (fn) { scheduled.push(fn); return scheduled.length; },
  clearTimeoutImpl: function () {},
  onStatus: function (s) { statuses.push(s); },
  onTrade: function (p) { prints.push(p); },
  onReconnect: function () { return new Promise(function (resolve) { releaseRefresh = resolve; }); }
});
var frame = JSON.stringify({ type: 'trade', marketId: market, sequence: 7, price: '12.34', quantity: '0.5', ts: '2026-09-02T10:00:00.000Z' });
(async function () {
  sockets[0].onopen();
  sockets[0].onmessage({ data: frame });
  assert(prints.length === 1 && statuses[statuses.length - 1] === 'live', 'valid print is the first live edge');
  sockets[0].onclose();
  assert(statuses[statuses.length - 1] === 'reconnecting' && scheduled.length === 1, 'close schedules reconnect');
  scheduled.shift()();
  sockets[1].onopen();
  await Promise.resolve();
  sockets[1].onmessage({ data: JSON.stringify({ type: 'trade', marketId: market, sequence: 8, price: '12.35', quantity: '0.6', ts: '2026-09-02T10:01:00.000Z' }) });
  assert(prints.length === 1 && statuses.indexOf('resyncing') >= 0, 'reconnect buffers prints behind REST refresh');
  releaseRefresh();
  await new Promise(function (resolve) { setImmediate(resolve); });
  assert(prints.length === 2 && statuses[statuses.length - 1] === 'live', 'buffer flushes only after refresh');
  live.stop();
  if (failed) process.exit(1);
  console.log('\nix-candle-feed.golden: all passed');
})();
