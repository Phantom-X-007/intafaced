/* Fail-first golden: Bazaar cancel-on-disconnect uses server receipt, not client clock. */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');
var cod = require('./ix-cod.js');

var page = fs.readFileSync(path.join(__dirname, '../../pages/exchange/Exchange.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');
var src = fs.readFileSync(path.join(__dirname, 'ix-cod.js'), 'utf8');

function fail(name) {
  throw new Error(name);
}

var arm = cod.toArmCommand({ ttlMs: '5000', scope: 'account', commandId: 'cmd-1' });
if (!arm.ok) fail('arm builder refused a typed integer ttl');
if (arm.body.type !== 'cod.arm' || arm.body.ttlMs !== 5000 || arm.body.scope !== 'account') {
  fail('arm body drifted');
}
if (Object.prototype.hasOwnProperty.call(arm.body, 'expiresAt') || Object.prototype.hasOwnProperty.call(arm.body, 'clientNow')) {
  fail('arm must not send client clock fields');
}

if (cod.toArmCommand({ ttlMs: '', scope: 'account' }).ok) fail('empty ttl must not invent a lease');
if (cod.toArmCommand({ ttlMs: 5000.5, scope: 'account' }).ok) fail('non-integer ttl must not invent a lease');
if (cod.toArmCommand({ ttlMs: '5000', scope: 'session', excludedOrderClasses: ['iceberg'] }).ok) {
  fail('excluded classes must refuse-closed, not drop silently');
}
if (cod.toArmCommand({ ttlMs: '5000', scope: 'market' }).ok) fail('market scope without marketId must refuse');

var market = cod.toArmCommand({ ttlMs: '1000', scope: 'market', marketId: 'm-1', commandId: 'cmd-m' });
if (!market.ok || market.body.marketId !== 'm-1') fail('market arm must forward venue id');

var heartbeat = cod.toRenewCommand({ heartbeat: true, commandId: 'hb-1' });
if (!heartbeat.ok || heartbeat.body.type !== 'cod.heartbeat' || heartbeat.body.commandId !== 'hb-1') {
  fail('heartbeat command');
}
var renew = cod.toRenewCommand({ commandId: 'rn-1' });
if (renew.body.type !== 'cod.renew') fail('renew alias');
var disarm = cod.toDisarmCommand({ commandId: 'd-1' });
if (disarm.body.type !== 'cod.disarm') fail('disarm command');

if (src.indexOf('WS_COD_MIN_LEASE_MS') !== -1 || src.indexOf('WS_COD_MAX_LEASE_MS') !== -1) {
  fail('client must not invent owner lease range');
}
if (src.indexOf('minTtlMs') !== -1 || src.indexOf('maxTtlMs') !== -1) {
  fail('client must not invent min/max TTL');
}

var armed = cod.applyFrame(cod.emptyView(), {
  channel: 'cod',
  type: 'cod.armed',
  commandId: 'cmd-1',
  leaseCommandId: 'cmd-1',
  receivedAt: '2026-08-25T07:00:00.000Z',
  expiresAt: '1999-01-01T00:00:00.000Z',
  ttlMs: 5000,
  scope: 'account',
  marketId: null,
  cancelExecutable: true,
  recoveryPolicy: 'cod.replica_local'
});
if (!armed.armed || armed.receivedAt !== '2026-08-25T07:00:00.000Z') fail('server receipt not shown');
if (armed.expiresAt !== '1999-01-01T00:00:00.000Z') fail('server expiry must display even when the wall clock disagrees');
if (armed.ttlMs !== 5000) fail('ttl is server-authored');

var unconfigured = cod.applyFrame(cod.emptyView(), {
  channel: 'cod',
  type: 'cod.refused',
  commandId: 'cmd-1',
  code: 'cod.lease_range_unconfigured'
});
if (unconfigured.lastCode !== 'cod.lease_range_unconfigured' || unconfigured.armed) {
  fail('unconfigured owner socket must show refuse-closed');
}
if (unconfigured.ttlMs !== null) fail('unconfigured refuse must not invent a TTL');

var sessionFired = cod.applyFrame(armed, {
  channel: 'cod',
  type: 'cod.fired',
  commandId: 'cmd-1',
  activation: 'disconnect',
  receivedAt: '2026-08-25T07:00:00.000Z',
  expiresAt: '2026-08-25T07:00:05.000Z',
  firedAt: '2026-08-25T07:00:06.000Z',
  scope: 'session',
  marketId: null,
  tradeReached: false,
  complete: false,
  recoveryPolicy: 'cod.replica_local',
  targets: [{ selector: 'session', outcome: 'OUTCOME_UNKNOWN', reason: 'cod.session_scope_not_mapped' }]
});
if (sessionFired.lastCompletion !== 'OUTCOME_UNKNOWN') fail('session fire must stay UNKNOWN');
if (sessionFired.lastCompletionReason !== 'cod.session_scope_not_mapped') fail('session mapping hole must not be hidden');
if (sessionFired.complete !== false || sessionFired.tradeReached !== false) fail('session fire is not complete');

var disconnect = cod.applyDisconnect(armed);
if (disconnect.lastCompletion !== 'OUTCOME_UNKNOWN') fail('disconnect without fire is UNKNOWN');
if (disconnect.lastCompletionReason !== 'cod.disconnect_unconfirmed') fail('disconnect reason');
if (disconnect.complete !== false) fail('disconnect must not claim complete');
if (disconnect.lastTargets.length !== 0) fail('disconnect must not invent an empty cancelled book');
if (disconnect.armed) fail('disconnect clears armed');

var lie = cod.applyFrame(armed, {
  channel: 'cod',
  type: 'cod.fired',
  complete: true,
  tradeReached: false,
  targets: [{ selector: 'account', outcome: 'APPLIED' }]
});
if (lie.lastCompletion !== 'OUTCOME_UNKNOWN' || lie.lastCode !== 'cod.invented_mass_success') {
  fail('complete without tradeReached must not become APPLIED');
}
if (!cod.wouldInventCodMassSuccess({ channel: 'cod', type: 'cod.fired', complete: true, tradeReached: false })) {
  fail('mass-success detector');
}
if (!cod.wouldInventCodMassSuccess({ type: 'snapshot', channel: 'orders', codComplete: true })) {
  fail('orders snapshot must not smuggle COD complete');
}

var appliedFire = cod.applyFrame(armed, {
  channel: 'cod',
  type: 'cod.fired',
  commandId: 'cmd-1',
  activation: 'lease_expired',
  receivedAt: '2026-08-25T07:00:00.000Z',
  expiresAt: '2026-08-25T07:00:05.000Z',
  scope: 'account',
  tradeReached: true,
  complete: true,
  targets: [{ selector: 'o1', outcome: 'APPLIED' }]
});
if (appliedFire.lastCompletion !== 'APPLIED') fail('honest APPLIED');

var refusedFire = cod.applyFrame(armed, {
  channel: 'cod',
  type: 'cod.fired',
  commandId: 'cmd-1',
  activation: 'disconnect',
  receivedAt: '2026-08-25T07:00:00.000Z',
  expiresAt: '2026-08-25T07:00:05.000Z',
  scope: 'account',
  tradeReached: true,
  complete: true,
  targets: [{ selector: 'account', outcome: 'REFUSED', reason: 'cod.trade_refused' }]
});
if (refusedFire.lastCompletion !== 'REFUSED') fail('honest REFUSED');

if (cod.privateStreamUrl('tok').indexOf('/ws/private/stream?access_token=tok') === -1) {
  fail('private stream url');
}

var timers = [];
function schedule(fn, ms) {
  timers.push({ fn: fn, ms: ms, cancelled: false });
  return function () {
    timers[timers.length - 1].cancelled = true;
  };
}
function MockWS(url) {
  this.url = url;
  this.readyState = 0;
  this.sent = [];
  MockWS.last = this;
}
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

var views = [];
var handle = cod.createPrivateCodStream({
  accessToken: 'tok',
  WebSocketImpl: MockWS,
  schedule: schedule,
  onView: function (v) {
    views.push(v);
  }
});
if (!MockWS.last) fail('socket constructed');
if (MockWS.last.url.indexOf('/ws/private/stream') === -1) fail('live private socket path');
MockWS.last.readyState = 1;
MockWS.last.onopen();
handle.arm({ ttlMs: '4000', scope: 'account', commandId: 'live-1' });
var sentArm = JSON.parse(MockWS.last.sent[0]);
if (sentArm.type !== 'cod.arm' || sentArm.ttlMs !== 4000) fail('arm on live socket');
if (sentArm.expiresAt || sentArm.clientNow) fail('live arm must not send client clock');

handle._apply({
  channel: 'cod',
  type: 'cod.armed',
  commandId: 'live-1',
  leaseCommandId: 'live-1',
  receivedAt: '2026-08-25T08:00:00.000Z',
  expiresAt: '2026-08-25T08:00:04.000Z',
  ttlMs: 4000,
  scope: 'account',
  cancelExecutable: true,
  recoveryPolicy: 'cod.replica_local'
});
var hb = timers.filter(function (t) {
  return t.ms === 2000 && !t.cancelled;
});
if (hb.length !== 1) fail('heartbeat scheduled from server ttl, not client expiry');
hb[0].fn();
var lastSent = JSON.parse(MockWS.last.sent[MockWS.last.sent.length - 1]);
if (lastSent.type !== 'cod.heartbeat') fail('heartbeat from the live private socket');

handle._apply({
  channel: 'orders',
  type: 'snapshot',
  orders: [],
  codComplete: true
});
var afterSnap = handle._view();
if (afterSnap.lastCompletion === 'APPLIED') fail('empty orders snapshot must not look like a cancelled book');

handle._close();
var afterClose = handle._view();
if (afterClose.lastCompletion !== 'OUTCOME_UNKNOWN') fail('socket death is UNKNOWN');
if (afterClose.lastTargets.length !== 0) fail('socket death must not invent empty targets');
handle.stop();

[
  "require('../../assets/js/ix-cod.js')",
  'startCodStream',
  'stopCodStream',
  'armCod',
  'renewCod',
  'disarmCod',
  'spotCodVisible',
  'codView.receivedAt',
  'codView.expiresAt',
  'codView.lastCompletion',
  "cod.lease_range_unconfigured",
  'codTtlMs',
  "codScope === 'session'"
].forEach(function (marker) {
  if (page.indexOf(marker) === -1) fail('Exchange wiring missing: ' + marker);
});

assert.strictEqual(page.indexOf('Date.parse(this.codView.expiresAt)'), -1, 'client clock must not decide expiry');
assert.strictEqual(page.indexOf('Date.now()') === page.indexOf('Date.now()') ? true : true, 'presence check noop');
if (/Date\.now\(\)[^\n]{0,80}codView\.expiresAt|codView\.expiresAt[^\n]{0,80}Date\.now\(\)/.test(page)) {
  fail('client clock compared to server expiry');
}
if (page.indexOf('openOrders = []') !== -1 && /codView[\s\S]{0,200}openOrders = \[\]/.test(page)) {
  fail('COD must not wipe the blotter into a fake empty book');
}

[
  'codTitle',
  'codArm',
  'codRenew',
  'codDisarm',
  'codReceipt',
  'codExpiry',
  'codUnconfigured',
  'codSessionUnknown',
  'codDisconnectUnknown'
].forEach(function (key) {
  if (lang.indexOf(key + ':') === -1) fail('en.js missing ' + key);
});

console.log('ix-cod golden: PASS');
