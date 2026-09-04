'use strict';

/**
 * Golden: PTX-M07-R09 / remaining-SOT R09 — per-channel session facts.
 * Run: node src/assets/js/ix-channel-status.golden.js
 *
 * Unset does not invent live. Failed ≠ empty.
 */
var fs = require('fs');
var path = require('path');
var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    failed += 1;
  } else {
    console.log('ok', msg);
  }
}

var status;
try {
  status = require('./ix-channel-status.js');
} catch (e) {
  console.error('FAIL helper missing:', e.message);
  process.exit(1);
}

assert(typeof status.classifyChannelStatus === 'function', 'classifyChannelStatus export');
assert(Array.isArray(status.CHANNEL_IDS), 'CHANNEL_IDS export');

var REQUIRED = [
  'auth',
  'trading',
  'private',
  'md.depth',
  'md.trades',
  'md.candles',
  'clock',
  'schema',
  'deps'
];
REQUIRED.forEach(function (id) {
  assert(status.CHANNEL_IDS.indexOf(id) !== -1, 'stable channel id ' + id);
});
assert(status.CHANNEL_IDS.length === REQUIRED.length, 'no extra channel ids');

function model(input) {
  return status.classifyChannelStatus(input);
}

function keysOf(input) {
  return model(input).keys;
}

var empty = model({});
assert(empty && empty.keys, 'empty input returns keys');
assert(empty.sessionLive !== true, 'empty does not invent session live');
REQUIRED.forEach(function (id) {
  assert(empty.keys[id] === 'unset', id + ' unset on empty input');
  assert(String(empty.title).indexOf(id + ':unset') !== -1, id + ' in title as unset');
});
assert(empty.keys['md.trades'] !== 'empty', 'unset ≠ empty');
assert(empty.keys['md.trades'] !== 'failed', 'unset ≠ failed');
assert(empty.badge.indexOf('Depth live') === -1, 'empty badge does not claim Depth live');
assert(!/^(Depth live|signed in|trading live|private live)$/.test(empty.badge), 'empty badge is not a live headline');

assert(keysOf({ auth: false }).auth === 'failed', 'auth false is failed, not unset');
assert(keysOf({ auth: false }).auth !== 'live', 'auth false is not live');
assert(keysOf({ auth: true }).auth === 'live', 'auth true is live');
assert(keysOf({ auth: true })['md.depth'] === 'unset', 'auth live does not invent depth live');

assert(keysOf({ trading: true }).trading === 'live', 'trading true');
assert(keysOf({ trading: false }).trading === 'failed', 'trading false is failed');
assert(keysOf({ trading: false })['private'] === 'unset', 'trading false does not invent private');

assert(keysOf({ private: true }).private === 'live', 'private true');
assert(keysOf({ private: false }).private === 'failed', 'private false is failed');

assert(keysOf({ md: { depth: true } })['md.depth'] === 'live', 'depth true is live');
assert(keysOf({ md: { depth: false } })['md.depth'] === 'failed', 'depth false is failed');
assert(
  keysOf({ md: { depth: { live: true, empty: true } } })['md.depth'] === 'empty',
  'live empty book is empty, not failed'
);
assert(
  keysOf({ md: { depth: { live: true, empty: false } } })['md.depth'] === 'live',
  'live book with levels is live'
);
assert(
  keysOf({ md: { depth: { live: false, empty: true } } })['md.depth'] === 'failed',
  'not-live empty flag is failed, not empty'
);

assert(
  keysOf({ md: { trades: { reachable: true, empty: true } } })['md.trades'] === 'empty',
  'reachable empty trades is empty'
);
assert(
  keysOf({ md: { trades: { reachable: false } } })['md.trades'] === 'failed',
  'unreachable trades is failed'
);
assert(
  keysOf({ md: { trades: { reachable: false, empty: true } } })['md.trades'] === 'failed',
  'failed ≠ empty even if empty flag set'
);
assert(
  keysOf({ md: { trades: { reachable: true } } })['md.trades'] === 'live',
  'reachable trades with no empty flag is live'
);

assert(keysOf({ md: { candles: { status: 'failed' } } })['md.candles'] === 'failed', 'candles failed');
assert(keysOf({ md: { candles: { status: 'empty' } } })['md.candles'] === 'empty', 'candles empty ≠ failed');
assert(
  keysOf({ md: { candles: { status: 'ok' } } })['md.candles'] === 'unset',
  'snapshot ok without live sub does not invent candles live'
);
assert(
  keysOf({ md: { candles: { status: 'ok', live: true } } })['md.candles'] === 'live',
  'candles live only with live fact'
);
assert(
  keysOf({ md: { candles: { status: 'ok', live: false } } })['md.candles'] !== 'live',
  'candles live:false is not live'
);

assert(keysOf({ clock: true }).clock === 'live', 'clock true');
assert(keysOf({ clock: false }).clock === 'failed', 'clock false is failed');
assert(keysOf({}).clock === 'unset', 'clock omitted stays unset');

assert(keysOf({ schema: { version: 2 } }).schema === 'live', 'schema version is a live fact');
assert(keysOf({ schema: false }).schema === 'failed', 'schema false is failed');
assert(keysOf({}).schema === 'unset', 'schema omitted stays unset');

assert(keysOf({ deps: { degraded: true } }).deps === 'degraded', 'deps degraded');
assert(keysOf({ deps: true }).deps === 'live', 'deps ok');
assert(keysOf({ deps: false }).deps === 'failed', 'deps failed');
assert(keysOf({ deps: { degraded: true } }).deps !== 'empty', 'degraded ≠ empty');

var mixed = model({
  auth: true,
  md: { depth: true, trades: { reachable: false } }
});
assert(mixed.keys.auth === 'live', 'mixed: auth stays live');
assert(mixed.keys['md.depth'] === 'live', 'mixed: depth stays live');
assert(mixed.keys['md.trades'] === 'failed', 'mixed: trades failed independently');
assert(mixed.keys.clock === 'unset', 'mixed: clock still unset');
assert(mixed.sessionLive !== true, 'partial live is not session live');
assert(String(mixed.title).indexOf('md.trades:failed') !== -1, 'title names failed trades');
assert(String(mixed.title).indexOf('md.depth:live') !== -1, 'title names live depth');

var allLive = model({
  auth: true,
  trading: true,
  private: true,
  md: {
    depth: true,
    trades: { reachable: true },
    candles: { live: true }
  },
  clock: true,
  schema: { version: 2 },
  deps: true
});
assert(allLive.sessionLive === true, 'all live facts → sessionLive');
REQUIRED.forEach(function (id) {
  var k = allLive.keys[id];
  assert(k === 'live' || k === 'empty', id + ' live-or-empty when all supplied live');
});

var vue = fs.readFileSync(path.join(__dirname, '../../pages/exchange/Exchange.vue'), 'utf8');
assert(/ix-channel-status\.js/.test(vue), 'Exchange.vue imports ix-channel-status');
assert(/classifyChannelStatus\(/.test(vue), 'Exchange.vue calls classifyChannelStatus');
assert(/channelStatus\.title/.test(vue), 'Exchange.vue uses channelStatus.title');
assert(/channelStatus\.badge/.test(vue), 'Exchange.vue uses channelStatus.badge');
assert(
  vue.indexOf("feedLive ? $t('exchange.terminal.feedConnected')") === -1,
  'header title is no longer a single feedLive ternary'
);
assert(/ix-head-status/.test(vue), 'existing status slot kept');
assert(!/ix-channel-chip/.test(vue), 'no new per-channel chip chrome');

if (failed) {
  console.error(failed + ' golden failure(s)');
  process.exit(1);
}
console.log('all ix-channel-status golden tests passed');
