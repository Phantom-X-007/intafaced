/**
 * Golden tests for book-honesty.js — no jest required.
 * Run from 05_Web_Front:  node src/assets/js/book-honesty.golden.js
 * Evidence: A-UI-2 empty book + error envelope honesty.
 */
'use strict';

var path = require('path');
var h = require(path.join(__dirname, 'book-honesty.js'));

var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function num(v) {
  var n = parseFloat(v);
  return isFinite(n) ? n : 0;
}

/* ── empty book labels ───────────────────────────────────────────────── */
assert(
  h.bookSideEmptyLabel({ loading: true, reachable: false, side: 'bids' }) ===
    'Loading order book…',
  'loading beats unavailable'
);
assert(
  h.bookSideEmptyLabel({ loading: false, reachable: false, side: 'asks' }) ===
    'Book unavailable — market did not respond',
  'unreachable ≠ empty'
);
assert(
  h.bookSideEmptyLabel({ loading: false, reachable: true, side: 'asks' }) === 'No asks',
  'reachable empty asks'
);
assert(
  h.bookSideEmptyLabel({ loading: false, reachable: true, side: 'bids' }) === 'No bids',
  'reachable empty bids'
);

assert(
  h.tradesEmptyLabel({ loading: true, reachable: false }) === 'Loading trades…',
  'trades loading'
);
assert(
  h.tradesEmptyLabel({ loading: false, reachable: false }) ===
    'Trades unavailable — market did not respond',
  'trades unreachable'
);
assert(
  h.tradesEmptyLabel({ loading: false, reachable: true }) === 'No trades yet',
  'trades empty honest'
);

/* ── no fake levels ──────────────────────────────────────────────────── */
var levels = h.normalizePlateLevels(
  [
    { price: 100, amount: 1 },
    { price: 0, amount: 5 },
    { price: 99, amount: 0 },
    { price: -1, amount: 2 },
    { price: 98, amount: 3 },
    null,
    { price: '97.5', amount: '2.5' }
  ],
  14,
  num
);
assert(levels.length === 3, 'drops zero/invalid levels (got ' + levels.length + ')');
assert(levels[0].price === 100 && levels[0].totalAmount === 1, 'first real level + cumulative');
assert(levels[1].price === 98 && levels[1].totalAmount === 4, 'second cumulative');
assert(levels[2].price === 97.5 && levels[2].amount === 2.5, 'string numbers ok');
assert(h.normalizePlateLevels([], 14, num).length === 0, 'empty in → empty out (no pad)');
assert(h.normalizePlateLevels(null, 14, num).length === 0, 'null in → empty out');
assert(
  h.normalizePlateLevels(
    [
      { price: 1, amount: 1 },
      { price: 2, amount: 1 },
      { price: 3, amount: 1 }
    ],
    2,
    num
  ).length === 2,
  'respects maxDepth'
);

/* ── order reject envelope ───────────────────────────────────────────── */
assert(h.formatOrderRejectEnvelope(null).indexOf('not placed') >= 0, 'null body → not placed');
assert(h.formatOrderRejectEnvelope(undefined).indexOf('not placed') >= 0, 'undef body → not placed');
assert(h.formatOrderRejectEnvelope({ code: 0 }) === '', 'code 0 success → empty reject');
assert(h.formatOrderRejectEnvelope({ code: '0' }) === '', 'string "0" success');
assert(
  h.formatOrderRejectEnvelope({ code: 500, message: 'Insufficient balance' }).indexOf(
    'not placed'
  ) >= 0,
  'venue message + not placed'
);
assert(
  h.formatOrderRejectEnvelope({ code: 500, message: 'Insufficient balance' }).indexOf(
    'Insufficient balance'
  ) >= 0,
  'venue message preserved'
);
assert(
  h.formatOrderRejectEnvelope({ code: 4000, message: 'please login' }).indexOf('Session invalid') >=
    0,
  'auth code → session copy'
);
assert(
  h.formatOrderRejectEnvelope({ code: 1 }).indexOf('code 1') >= 0,
  'missing message uses code'
);
assert(
  h.formatOrderRejectEnvelope({}).indexOf('not placed') >= 0,
  'empty object → unknown, not placed'
);
assert(
  h.formatOrderRejectEnvelope({ code: 9, message: 'Order rejected by risk' }).indexOf(
    'Order rejected by risk'
  ) === 0,
  'already-rejected phrasing not double-suffixed awkwardly'
);

if (failed) {
  console.error('\n' + failed + ' failure(s)');
  process.exit(1);
}
console.log('\nall book-honesty golden tests passed');
process.exit(0);
