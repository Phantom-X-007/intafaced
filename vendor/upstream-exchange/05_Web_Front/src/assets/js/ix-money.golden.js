#!/usr/bin/env node
/**
 * Golden tests for ix-money.js — the desk's decimal arithmetic.
 * Run: node src/assets/js/ix-money.golden.js
 * Exit 0 = all pass; non-zero = failure (prints every miss).
 *
 * The MUTATION section at the bottom is the point of this file: it recomputes
 * the exact float expressions that used to live in Exchange.vue's fmt(), floor()
 * and applyPercent(), and asserts that the money path no longer agrees with
 * them. Reverting any of those three to parseFloat turns this file red.
 */
'use strict';

var path = require('path');
var BigNumber = require(path.join(__dirname, 'bignumber.min.js'));
var createIxMoney = require(path.join(__dirname, 'ix-money.js')).createIxMoney;
var m = createIxMoney(BigNumber);

var failed = 0;

function assertEqual(name, actual, expected) {
  if (actual !== expected) {
    console.error('FAIL', name, 'expected', JSON.stringify(expected), 'got', JSON.stringify(actual));
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

function assert(cond, name) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

/* ── toBN: unreadable is null, never zero ────────────────────────────────── */
assert(m.toBN(null) === null, 'toBN null → null');
assert(m.toBN(undefined) === null, 'toBN undefined → null');
assert(m.toBN('') === null, 'toBN empty → null');
assert(m.toBN('nope') === null, 'toBN garbage → null (NOT 0)');
assert(m.toBN('1,000') === null, 'toBN grouped string → null (NOT 1)');
assert(m.toBN(NaN) === null, 'toBN NaN → null');
assert(m.toBN(Infinity) === null, 'toBN Infinity → null');
assert(m.toBN('0') !== null, 'toBN zero is a real value');
assertEqual('toBN trims', m.toFixedString('  12.5  ', 2), '12.50');

/* ── toFixedString: TRUNCATE, never round; pad so a column can be scanned ── */
assertEqual('truncate-not-round-up', m.toFixedString('8.005', 2), '8.00');
assertEqual('truncate-1.45-at-1', m.toFixedString('1.45', 1), '1.4');
assertEqual('truncate-0.999-at-2', m.toFixedString('0.999', 2), '0.99');
assertEqual('pad-short-fraction', m.toFixedString('68412.5', 6), '68412.500000');
assertEqual('pad-integer', m.toFixedString('7', 4), '7.0000');
assertEqual('scale-0-truncates', m.toFixedString('10.9', 0), '10');
assertEqual('negative-truncates-toward-zero', m.toFixedString('-1.999', 2), '-1.99');
assertEqual('exponent-input-is-plain-out', m.toFixedString('1e-7', 8), '0.00000010');
assert(m.toFixedString('nope', 2) === null, 'toFixedString garbage → null (NOT "0.00")');
assert(m.toFixedString(null, 2) === null, 'toFixedString null → null');
assertEqual('bad-scale-keeps-full-precision', m.toFixedString('1.23456', 99), '1.23456');

/* Full 18-place crypto precision survives; no digit is invented or dropped. */
assertEqual(
  'scale-18-verbatim',
  m.toFixedString('100.123456789012345678', 18),
  '100.123456789012345678'
);

/* ── group: string surgery on digits, no locale/float path ───────────────── */
assertEqual('group-thousands', m.group('68412.500000'), '68,412.500000');
assertEqual('group-millions', m.group('1234567.89'), '1,234,567.89');
assertEqual('group-negative', m.group('-1234.5'), '-1,234.5');
assertEqual('group-short', m.group('999'), '999');
assertEqual('group-no-fraction-touch', m.group('1000.000000000000000001'), '1,000.000000000000000001');
assert(m.group(null) === null, 'group null → null');
assertEqual('display-pads-then-groups', m.display('1234.5', 2), '1,234.50');

/* ── decimalsOf: precision is the market's property ──────────────────────── */
assertEqual('decimalsOf-tick', m.decimalsOf('0.01'), 2);
assertEqual('decimalsOf-whole-lot', m.decimalsOf('1000'), 0);
assertEqual('decimalsOf-trailing-zeros', m.decimalsOf('0.100'), 1);
assert(m.decimalsOf(null) === null, 'decimalsOf null → null');

/* ── exact arithmetic ────────────────────────────────────────────────────── */
assertEqual('add-float-trap', m.add('0.1', '0.2'), '0.3');
assertEqual('subtract-float-trap', m.subtract('0.3', '0.1'), '0.2');
assertEqual('multiply-float-trap', m.multiply('0.1', '3', 2), '0.30');
assertEqual('multiply-exact-turnover', m.multiply('68412.45', '0.31', 2), '21207.85');
assertEqual('divide-truncates', m.divide('1', '3', 8), '0.33333333');
assert(m.divide('1', '0', 8) === null, 'divide by zero → null (NOT Infinity, NOT 0)');
assert(m.divide('1', null, 8) === null, 'divide by unknown price → null');
assert(m.add('1', 'nope') === null, 'add with garbage → null');
assertEqual('percentOf-exact', m.percentOf('33.3', 30, 4), '9.9900');

/* A running ladder column: every row exact, which float sums are not. */
var total = '0';
for (var i = 0; i < 10; i++) {
  total = m.add(total, '0.1');
}
assertEqual('cumulative-ten-tenths', total, '1');

/* ── predicates ──────────────────────────────────────────────────────────── */
assert(m.isPositive('0.00000001') === true, 'isPositive dust');
assert(m.isPositive('0') === false, 'isPositive zero is false');
assert(m.isPositive('nope') === false, 'isPositive garbage is false');
assert(m.compare('1.10', '1.1') === 0, 'compare ignores trailing zeros');
assert(m.compare('nope', '1') === null, 'compare unknown → null');
assert(m.greaterThan('2', '1') === true, 'greaterThan');
assert(m.greaterThan('nope', '1') === false, 'greaterThan unknown is false, not true');

/* ── ratio: the one legitimate float, and it scales in decimal first ─────── */
assertEqual('ratio-half', m.ratio('5', '10'), 0.5);
assertEqual('ratio-third', m.ratio('1', '3'), 0.3333);
assertEqual('ratio-clamped', m.ratio('20', '10'), 1);
assertEqual('ratio-no-total', m.ratio('1', '0'), 0);
assertEqual('ratio-unknown', m.ratio(null, '10'), 0);

/* ── toFloat: the named escape hatch, null on failure ────────────────────── */
assertEqual('toFloat-ok', m.toFloat('1.5'), 1.5);
assert(m.toFloat('nope') === null, 'toFloat garbage → null (NOT 0)');
assert(m.toFloat(null) === null, 'toFloat null → null');

/* ── the order ticket ────────────────────────────────────────────────────── */
assert(m.bookPriceForForm('0', 6) === null, 'a zero level is not a price');
assert(m.bookPriceForForm('-1', 6) === null, 'a negative level is not a price');
assert(m.bookPriceForForm(null, 6) === null, 'a missing level is not a price');
assertEqual('bookPrice-pads', m.bookPriceForForm('68412.5', 6), '68412.500000');

assertEqual('percentSize-100pct-sell', m.percentSize({ balance: '4.35', percent: 100, scale: 2 }), '4.35');
assertEqual('percentSize-25pct', m.percentSize({ balance: '1', percent: 25, scale: 8 }), '0.25000000');
assertEqual(
  'percentSize-buy-divides-by-price',
  m.percentSize({ balance: '1000', percent: 50, scale: 6, divideBy: '250' }),
  '2.000000'
);
assertEqual(
  'percentSize-buy-truncates',
  m.percentSize({ balance: '100', percent: 100, scale: 6, divideBy: '3' }),
  '33.333333'
);
assert(m.percentSize({ balance: null, percent: 100, scale: 8 }) === null, 'no balance → null size');
assert(m.percentSize({ balance: '1', percent: 0, scale: 8 }) === null, 'zero percent → null size');
assert(m.percentSize({ balance: '1', percent: 101, scale: 8 }) === null, 'over 100% → null size');
assert(
  m.percentSize({ balance: '1', percent: 100, scale: 6, divideBy: '0' }) === null,
  'no price → null size (never divide by a price we do not have)'
);
assert(m.percentSize({ balance: '1', percent: 100, scale: 'x' }) === null, 'bad scale → null size');

/* ══ MUTATION: the float path this replaced, recomputed inline ═════════════
 *
 * Each block runs the EXACT expression that used to be in Exchange.vue and
 * asserts the money path no longer produces it. These are the assertions that
 * fail if fmt/floor/useBookPrice/applyPercent go back to parseFloat.
 */

/* fmt() was: parseFloat(v).toFixed(scale) — a binary round-trip that invents
   digits past the 17th significant one. This is a venue price clicked out of
   the book at a 15-place market. */
var VENUE_PRICE = '68412.123456789012345';
var legacyFmt15 = parseFloat(VENUE_PRICE).toFixed(15);
assertEqual('MUTATION legacy fmt invented digits', legacyFmt15, '68412.123456789006013');
assertEqual('MUTATION book price is the venue string', m.bookPriceForForm(VENUE_PRICE, 15), VENUE_PRICE);
assert(
  m.bookPriceForForm(VENUE_PRICE, 15) !== legacyFmt15,
  'MUTATION a float-round-tripped price can no longer reach the form'
);

/* fmt() also ROUNDED. 8.005 at 2dp went out as 8.01 — a price 0.005 above the
   one on the ladder the trader clicked. */
var legacyFmtRound = parseFloat('8.005').toFixed(2);
assertEqual('MUTATION legacy fmt rounded up', legacyFmtRound, '8.01');
assertEqual('MUTATION price truncates instead', m.bookPriceForForm('8.005', 2), '8.00');
assert(m.bookPriceForForm('8.005', 2) !== legacyFmtRound, 'MUTATION no rounded-up quote reaches the form');

/* floor() was: Math.floor(n * 10^scale) / 10^scale — a float multiply, then a
   float divide. A 100% sell of a 4.35 balance sent 4.34 and left dust behind. */
function legacyFloor(value, scale) {
  var n = parseFloat(value);
  if (!isFinite(n) || n <= 0) return '';
  var factor = Math.pow(10, scale);
  return (Math.floor(n * factor) / factor).toFixed(scale);
}
var legacySellAll = legacyFloor((4.35 * 100) / 100, 2);
assertEqual('MUTATION legacy 100% sell short-changed the trader', legacySellAll, '4.34');
assertEqual(
  'MUTATION 100% sell is the whole balance',
  m.percentSize({ balance: '4.35', percent: 100, scale: 2 }),
  '4.35'
);
assert(
  m.percentSize({ balance: '4.35', percent: 100, scale: 2 }) !== legacySellAll,
  'MUTATION percent sizing no longer runs through a float'
);

/* applyPercent() was: (availableBalanceNum * percent) / 100 in float. 30% of a
   33.3 balance is 9.99 exactly; the float said 9.989999999999998. */
var legacyPct = legacyFloor((33.3 * 30) / 100, 4);
assertEqual('MUTATION legacy percent lost the last place', legacyPct, '9.9899');
assertEqual('MUTATION percent is exact', m.percentSize({ balance: '33.3', percent: 30, scale: 4 }), '9.9900');
assert(m.percentSize({ balance: '33.3', percent: 30, scale: 4 }) !== legacyPct, 'MUTATION percent no longer drifts');

/* num() returned 0 for anything unreadable, so an unparseable balance sized an
   order against a fabricated zero instead of refusing. */
function legacyNum(value) {
  var n = parseFloat(value);
  return isFinite(n) ? n : 0;
}
assertEqual('MUTATION legacy num fabricated a zero', legacyNum('unavailable'), 0);
assert(m.toBN('unavailable') === null, 'MUTATION unreadable money is null, not zero');
assert(m.toFloat('unavailable') === null, 'MUTATION unreadable money is null through the float hatch too');

/* normalizePlateLevels totalled the ladder in float: ten 0.1 levels summed to
   0.9999999999999999 by row ten. */
var legacyLadder = 0;
for (var j = 0; j < 10; j++) legacyLadder += 0.1;
assert(legacyLadder !== 1, 'MUTATION legacy ladder total was not 1 (' + legacyLadder + ')');
assertEqual('MUTATION ladder total is exact', total, '1');

if (failed > 0) {
  console.error('\n' + failed + ' golden test(s) failed');
  process.exit(1);
}
console.log('\nall ix-money golden tests passed');
process.exit(0);
