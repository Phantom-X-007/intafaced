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
  h.tradesEmptyLabel({
    loading: false,
    reachable: false,
    message: 'invalid_response: trades[0].price is a JSON number'
  }) === 'invalid_response: trades[0].price is a JSON number',
  'trades shape message beats generic unreachable'
);
assert(
  h.tradesEmptyLabel({ loading: false, reachable: true }) === 'No trades yet',
  'trades empty honest'
);
assert(
  h.bookSideEmptyLabel({
    loading: false,
    reachable: false,
    side: 'bids',
    message: 'invalid_response: bids[0][0] is a JSON number'
  }) === 'invalid_response: bids[0][0] is a JSON number',
  'book shape message beats generic unreachable'
);

/* ── no fake levels ──────────────────────────────────────────────────── */
/* Levels are decimal STRINGS now (see normalizePlateLevels): the ladder's
   cumulative column is a BigNumber running sum, not `total += amount`. */
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
  14
);
assert(levels.length === 3, 'drops zero/invalid levels (got ' + levels.length + ')');
assert(levels[0].price === '100' && levels[0].totalAmount === '1', 'first real level + cumulative');
assert(levels[1].price === '98' && levels[1].totalAmount === '4', 'second cumulative');
assert(levels[2].price === '97.5' && levels[2].amount === '2.5', 'string numbers ok');
assert(levels[2].totalAmount === '6.5', 'third cumulative');
assert(h.normalizePlateLevels([], 14).length === 0, 'empty in → empty out (no pad)');
assert(h.normalizePlateLevels(null, 14).length === 0, 'null in → empty out');
assert(
  h.normalizePlateLevels(
    [
      { price: 1, amount: 1 },
      { price: 2, amount: 1 },
      { price: 3, amount: 1 }
    ],
    2
  ).length === 2,
  'respects maxDepth'
);
assert(
  h.normalizePlateLevels([{ price: '1', amount: 'nope' }], 14).length === 0,
  'unreadable amount is not depth (never a fabricated zero level)'
);

/* The float trap the old `total += num(amount)` fell into: ten 0.1 levels.
   Row ten read 0.9999999999999999 on a ladder whose depth is exactly 1. */
var tenths = [];
for (var t = 0; t < 10; t++) tenths.push({ price: '100', amount: '0.1' });
var ladder = h.normalizePlateLevels(tenths, 14);
assert(ladder.length === 10, 'ten tenth-levels survive');
assert(ladder[2].totalAmount === '0.3', 'cumulative 0.1+0.1+0.1 is 0.3, not 0.30000000000000004');
assert(ladder[9].totalAmount === '1', 'cumulative ten tenths is 1, not 0.9999999999999999');
assert(
  ladder[9].totalAmount !== String(0.1 + 0.1 + 0.1 + 0.1 + 0.1 + 0.1 + 0.1 + 0.1 + 0.1 + 0.1),
  'ladder total no longer agrees with the float sum it replaced'
);

/* A venue price with more digits than a double can hold survives verbatim —
   the old path coerced it and the ladder printed digits nobody quoted. */
var deep = h.normalizePlateLevels([{ price: '68412.123456789012345', amount: '0.5' }], 14);
assert(deep[0].price === '68412.123456789012345', 'venue price kept digit-for-digit');
assert(
  deep[0].price !== String(parseFloat('68412.123456789012345')),
  'venue price is not a float round-trip'
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
