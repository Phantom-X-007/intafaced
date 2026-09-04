/**
 * Golden: remaining-SOT M07 R05 — unify live blotter books; explicit UNAVAILABLE
 * for RFQ / borrow / strategies / transfers / errors until a desk query exists.
 *
 * Run from 05_Web_Front:
 *   node src/assets/js/ix-blotter-tabs.golden.js
 *
 * Failed ≠ empty ≠ zero. Unauthorized ≠ anonymous.
 * Vue type-strip: this golden may fail LOOK density; do not restyle.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

var tabs;
try {
  tabs = require('./ix-blotter-tabs.js');
} catch (e) {
  console.error('FAIL helper missing:', e.message);
  process.exit(1);
}

assert(typeof tabs.blotterTabs === 'function', 'blotterTabs export');

function ids(list) {
  return list.map(function (t) {
    return t.id;
  });
}

function byId(list, id) {
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

var LIVE_SPOT = ['balances', 'positions', 'open', 'fills', 'history', 'drop-copy'];
var UNAVAILABLE = ['rfq', 'borrow', 'strategies', 'transfers', 'errors'];

var spot = tabs.blotterTabs({});
assert(Array.isArray(spot) && spot.length > 0, 'default returns tabs');
assert(ids(spot).join(',') === LIVE_SPOT.concat(UNAVAILABLE).join(','), 'spot live then unavailable books');
assert(ids(spot).indexOf('funding-history') === -1, 'spot omits funding-history (perp query only)');

LIVE_SPOT.forEach(function (id) {
  var t = byId(spot, id);
  assert(t && t.availability === 'live', id + ' is live on default desk');
  assert(!t.reason, id + ' live tab has no refuse reason');
});

UNAVAILABLE.forEach(function (id) {
  var t = byId(spot, id);
  assert(t && t.availability === 'unavailable', id + ' is unavailable until desk query');
  assert(typeof t.reason === 'string' && t.reason.length > 0, id + ' has refuse copy');
  assert(/query not mounted|no desk .* query/i.test(t.reason), id + ' reason is query-not-mounted, not missing-product');
  assert(t.reason.indexOf('$0') === -1 && t.reason.indexOf('0.00') === -1, id + ' reason is not $0');
  assert(t.availability !== 'empty' && t.availability !== 'zero' && t.availability !== 'failed', id + ' unavailable ≠ empty ≠ zero ≠ failed');
  assert(t.count == null || t.count === undefined, id + ' unavailable has no count (count 0 would read as empty book)');
});

var rfq = byId(spot, 'rfq');
assert(rfq && /firm[- ]quote/i.test(rfq.reason), 'RFQ reason names firm quote, not invented live rows');

var transfers = byId(spot, 'transfers');
assert(transfers && !/bank/i.test(transfers.reason), 'CEX blotter does not mount the bank transfer book');

var perp = tabs.blotterTabs({ isPerpKind: true, fundingHistoryCount: 2, positionsCount: 1, openCount: 3 });
assert(ids(perp).indexOf('funding-history') === 2, 'perp inserts funding-history after positions');
var fh = byId(perp, 'funding-history');
assert(fh && fh.availability === 'live', 'funding-history is live when perp (existing futures ticker query)');
assert(fh.count === 2, 'funding-history count from observation');
assert(byId(perp, 'positions').count === 1, 'positions count from observation');
assert(byId(perp, 'open').count === 3, 'open count from observation');
assert(byId(perp, 'rfq').availability === 'unavailable', 'perp does not invent RFQ live');

var drop = tabs.blotterTabs({ dropCopyLabel: 'Drop copy evidence' });
assert(byId(drop, 'drop-copy').label === 'Drop copy evidence', 'drop-copy label from observation');

var mounted = tabs.blotterTabs({ queries: { rfq: true, borrow: true } });
assert(byId(mounted, 'rfq').availability === 'live', 'RFQ goes live only when observation says desk query exists');
assert(!byId(mounted, 'rfq').reason, 'live RFQ has no refuse reason');
assert(byId(mounted, 'borrow').availability === 'live', 'borrow goes live only when query observation is true');
assert(byId(mounted, 'strategies').availability === 'unavailable', 'strategies stays unavailable without query');
assert(byId(mounted, 'transfers').availability === 'unavailable', 'transfers stays unavailable without query');
assert(byId(mounted, 'errors').availability === 'unavailable', 'errors stays unavailable without query');

assert(
  byId(tabs.blotterTabs({ queries: { rfq: false } }), 'rfq').availability === 'unavailable',
  'false query observation is unavailable, not live-empty'
);

var anon = tabs.sessionKind({ isLogin: false });
var unauth = tabs.sessionKind({ isLogin: true, unauthorized: true });
assert(anon === 'anonymous', 'signed-out is anonymous');
assert(unauth === 'unauthorized', '401 is unauthorized');
assert(anon !== unauth, 'unauthorized ≠ anonymous');
assert(tabs.sessionKind({ isLogin: true }) === 'signed-in', 'login without 401 is signed-in');

var vuePath = path.join(__dirname, '../../pages/exchange/Exchange.vue');
var vue = fs.readFileSync(vuePath, 'utf8');
assert(/ix-blotter-tabs\.js/.test(vue), 'Exchange.vue requires ix-blotter-tabs');
assert(/blotterTabs\(/.test(vue), 'accountTabs() consumes blotterTabs()');
assert(
  /availability === 'unavailable'/.test(vue) && /ix-empty ix-empty-error/.test(vue),
  'unavailable tabs render existing ix-empty ix-empty-error'
);
assert(
  !/accountTab === 'rfq'[\s\S]{0,400}ix-table/.test(vue),
  'RFQ tab is not an empty table-as-zero'
);

if (failed) {
  console.error(failed + ' golden failure(s)');
  process.exit(1);
}
console.log('all ix-blotter-tabs golden tests passed');
