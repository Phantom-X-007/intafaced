/**
 * R09 session-channel facts — pure mapper (no DOM, no CSS).
 *
 * Maps supplied channel flags to stable keys. Unset does not invent live.
 * Failed ≠ empty. CommonJS for golden tests (no bundler).
 *
 * Channels (PTX-M07-R09): auth, trading, private, each MD sub (depth / trades /
 * candles), clock, schema, degraded deps.
 */
'use strict';

var CHANNEL_IDS = [
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

var BADGE = {
  auth: { live: 'signed in', failed: 'signed out' },
  trading: { live: 'trading live', failed: 'trading down' },
  private: { live: 'private live', failed: 'private failed' },
  'md.depth': {
    live: 'Depth live',
    failed: 'No feed · not live prices',
    empty: 'depth empty'
  },
  'md.trades': { live: 'trades live', failed: 'trades failed', empty: 'trades empty' },
  'md.candles': {
    live: 'candles live',
    failed: 'candles failed',
    empty: 'candles empty'
  },
  clock: { live: 'clock ok', failed: 'clock failed' },
  schema: { live: 'schema ok', failed: 'schema failed' },
  deps: { live: 'deps ok', failed: 'deps failed', degraded: 'deps degraded' }
};

function isMd(id) {
  return id.indexOf('md.') === 0;
}

/**
 * @param {*} value
 * @returns {'unset'|'live'|'empty'|'failed'|'degraded'}
 */
function fromChannel(value) {
  if (value == null) return 'unset';
  if (value === true) return 'live';
  if (value === false) return 'failed';
  if (typeof value === 'string') {
    if (value === 'live' || value === 'ok') return 'live';
    if (value === 'empty') return 'empty';
    if (value === 'failed' || value === 'down') return 'failed';
    if (value === 'degraded') return 'degraded';
    return 'unset';
  }
  if (typeof value !== 'object') return 'unset';
  if (value.degraded === true) return 'degraded';
  if (value.status === 'failed' || value.failed === true) return 'failed';
  if (value.reachable === false) return 'failed';
  if (value.live === false) return 'failed';
  if (value.status === 'empty' || value.empty === true) return 'empty';
  if (value.live === true || value.status === 'live') return 'live';
  if (value.version != null && String(value.version) !== '') {
    return value.ok === false ? 'failed' : 'live';
  }
  if (value.reachable === true) return 'live';
  return 'unset';
}

function badgeFrom(keys) {
  var parts = [];
  for (var i = 0; i < CHANNEL_IDS.length; i++) {
    var id = CHANNEL_IDS[i];
    var k = keys[id];
    if (k === 'unset') continue;
    var table = BADGE[id] || {};
    parts.push(table[k] || id + ' ' + k);
  }
  if (!parts.length) return 'No feed · not live prices';
  return parts.join(' · ');
}

/**
 * @param {{
 *   auth?: *,
 *   trading?: *,
 *   private?: *,
 *   md?: { depth?: *, trades?: *, candles?: * },
 *   clock?: *,
 *   schema?: *,
 *   deps?: *
 * }} [input]
 * @returns {{
 *   keys: Object<string, string>,
 *   title: string,
 *   badge: string,
 *   sessionLive: boolean
 * }}
 */
function classifyChannelStatus(input) {
  var s = input || {};
  var md = s.md && typeof s.md === 'object' ? s.md : {};
  var raw = {
    auth: s.auth,
    trading: s.trading,
    private: s.private,
    'md.depth': md.depth,
    'md.trades': md.trades,
    'md.candles': md.candles,
    clock: s.clock,
    schema: s.schema,
    deps: s.deps
  };
  var keys = {};
  var titleParts = [];
  var sessionLive = true;
  for (var i = 0; i < CHANNEL_IDS.length; i++) {
    var id = CHANNEL_IDS[i];
    var k = fromChannel(raw[id]);
    keys[id] = k;
    titleParts.push(id + ':' + k);
    var ok = k === 'live' || (isMd(id) && k === 'empty');
    if (!ok) sessionLive = false;
  }
  return {
    keys: keys,
    title: titleParts.join(' '),
    badge: badgeFrom(keys),
    sessionLive: sessionLive
  };
}

module.exports = {
  CHANNEL_IDS: CHANNEL_IDS,
  classifyChannelStatus: classifyChannelStatus
};
