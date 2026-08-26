/* Fail-first golden: Bazaar drop-copy pane uses /drop-copy/stream; empty is RECOVERY_REQUIRED. */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');
var drop = require('./ix-drop-copy.js');

var page = fs.readFileSync(path.join(__dirname, '../../pages/exchange/Exchange.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');
var src = fs.readFileSync(path.join(__dirname, 'ix-drop-copy.js'), 'utf8');

function fail(name) {
  throw new Error(name);
}

var empty = drop.applyFrame(drop.emptyView(), {
  channel: 'drop_copy',
  type: 'snapshot',
  completeness: 'RECOVERY_REQUIRED',
  replayDurable: false,
  lastSeq: 0,
  executions: []
});
if (empty.completeness !== 'RECOVERY_REQUIRED') fail('empty snapshot must be RECOVERY_REQUIRED');
if (empty.executions.length !== 0) fail('empty snapshot must not invent fills');
if (empty.replayDurable) fail('replay must not claim durable');

var fakeComplete = drop.applyFrame(drop.emptyView(), {
  channel: 'drop_copy',
  type: 'snapshot',
  completeness: 'complete',
  complete: true,
  executions: []
});
if (fakeComplete.completeness !== 'RECOVERY_REQUIRED') fail('invented complete empty tape must be refused');
if (fakeComplete.lastCode !== 'drop_copy.recovery_required') fail('invented complete empty must name recovery');

var sessionClaimOnEmpty = drop.applyFrame(drop.emptyView(), {
  channel: 'drop_copy',
  type: 'ready',
  completeness: 'SESSION',
  executions: []
});
if (sessionClaimOnEmpty.completeness !== 'RECOVERY_REQUIRED') fail('empty ready must not look SESSION-complete');

var fill = {
  fillId: 'fill-1',
  orderId: 'ord-1',
  marketId: 'btc-usdt',
  side: 'buy',
  liquidity: 'maker',
  price: '100.5',
  qty: '0.01',
  quoteAmount: '1.005',
  feeAsset: 'USDT',
  feeAmount: '0.001',
  engineSequence: 7,
  dropCopySeq: 1,
  ts: '2026-08-25T00:00:00.000Z'
};
var snapped = drop.applyFrame(drop.emptyView(), {
  channel: 'drop_copy',
  type: 'snapshot',
  completeness: 'SESSION',
  replayDurable: true,
  lastSeq: 1,
  executions: [fill]
});
if (snapped.completeness !== 'SESSION') fail('non-empty session snapshot');
if (snapped.replayDurable) fail('client must not echo invented durable replay');
if (snapped.executions.length !== 1 || snapped.executions[0].price !== '100.5') fail('decimal fill strings');

var numbered = drop.normalizeExecution({ fillId: 'x', price: 100.5, qty: 1, dropCopySeq: 1 });
if (numbered.price !== null || numbered.qty !== null) fail('JSON numbers must not become money');

var live = drop.applyFrame(snapped, {
  channel: 'drop_copy',
  type: 'execution',
  fillId: 'fill-2',
  orderId: 'ord-2',
  marketId: 'btc-usdt',
  side: 'sell',
  liquidity: 'taker',
  price: '101',
  qty: '0.02',
  quoteAmount: '2.02',
  feeAsset: 'USDT',
  feeAmount: '0.002',
  engineSequence: 8,
  dropCopySeq: 2,
  ts: '2026-08-25T00:00:01.000Z'
});
if (live.executions.length !== 2 || live.lastSeq !== 2) fail('live execution append');

var dup = drop.applyFrame(live, {
  channel: 'drop_copy',
  type: 'execution',
  fillId: 'fill-2',
  dropCopySeq: 2,
  price: '999',
  qty: '9'
});
if (dup.executions.length !== 2) fail('duplicate fillId must not double-count');

var ignored = drop.applyFrame(live, { channel: 'fills', type: 'execution', fillId: 'other', price: '1', qty: '1' });
if (ignored.executions.length !== 2) fail('fills channel is not drop-copy');

var upstream = drop.applyFrame(drop.emptyView(), {
  channel: 'drop_copy',
  type: 'status',
  code: 'drop_copy.common_upstream_failure',
  completeness: 'COMMON_UPSTREAM_FAILURE',
  executions: []
});
if (upstream.completeness !== 'COMMON_UPSTREAM_FAILURE' || upstream.lastCode !== 'drop_copy.common_upstream_failure') {
  fail('upstream failure must be named');
}

var closed = drop.applyDisconnect(live);
if (closed.socket !== 'closed' || closed.completeness !== 'RECOVERY_REQUIRED') fail('disconnect watermarks recovery');
if (closed.replayDurable) fail('disconnect must not invent durable replay');

if (drop.dropCopyStreamUrl('tok').indexOf('/ws/drop-copy/stream?access_token=tok') === -1) {
  fail('drop-copy stream url');
}
if (src.indexOf('/ws/private/stream') !== -1) fail('drop-copy client must not ride the private trading stream');
if (src.indexOf('socket.send') !== -1) fail('drop-copy is read-only — never send place/cancel');

var MockWS = function (url) {
  this.url = url;
  this.readyState = 0;
  this.sent = [];
  MockWS.last = this;
};
MockWS.last = null;
MockWS.prototype = {
  send: function (text) {
    this.sent.push(text);
  },
  close: function () {
    this.readyState = 3;
    if (typeof this.onclose === 'function') this.onclose({});
  }
};

var handle = drop.createDropCopyStream({
  accessToken: 'tok',
  WebSocketImpl: MockWS,
  schedule: function () {
    return function () {};
  }
});
if (!MockWS.last) fail('socket constructed');
if (MockWS.last.url.indexOf('/ws/drop-copy/stream') === -1) fail('live drop-copy socket path');
MockWS.last.readyState = 1;
MockWS.last.onopen();
if (MockWS.last.sent.length !== 0) fail('open must not send trading commands');
handle._apply({
  channel: 'drop_copy',
  type: 'snapshot',
  completeness: 'RECOVERY_REQUIRED',
  executions: []
});
if (handle._view().completeness !== 'RECOVERY_REQUIRED') fail('live empty snapshot honesty');
handle.stop();

[
  "require('../../assets/js/ix-drop-copy.js')",
  'startDropCopyStream',
  'stopDropCopyStream',
  'dropCopyView',
  "accountTab === 'drop-copy'",
  'dropCopyView.completeness',
  'drop_copy.recovery_required'
].forEach(function (marker) {
  if (page.indexOf(marker) === -1) fail('Exchange wiring missing: ' + marker);
});
if (page.indexOf('completeness: \'complete\'') !== -1 || page.indexOf('completeness: "complete"') !== -1) {
  fail('Exchange must not claim a complete drop-copy tape');
}
if (page.indexOf('/ws/private/stream') !== -1 && /dropCopy[\s\S]{0,200}\/ws\/private\/stream/.test(page)) {
  fail('drop-copy pane must not use private/stream');
}

[
  'dropCopyTitle',
  'dropCopyNote',
  'dropCopyRecovery',
  'dropCopyUpstream',
  'dropCopyGap',
  'dropCopyCompleteness',
  'dropCopyReplay',
  'dropCopyEmpty'
].forEach(function (key) {
  if (lang.indexOf(key + ':') === -1) fail('en.js missing ' + key);
});

assert.ok(true);
console.log('ix-drop-copy golden: PASS');
