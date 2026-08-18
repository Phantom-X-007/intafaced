#!/usr/bin/env node
/**
 * Golden: market impact walk never invents avg via IEEE float.
 * Run: node src/assets/js/ix-market-impact.golden.js
 */
'use strict';

var path = require('path');
var money = require(path.join(__dirname, 'ix-money.js'));
var impact = require(path.join(__dirname, 'ix-market-impact.js'));

var failed = 0;
function ok(name) {
  console.log('ok:', name);
}
function fail(name, detail) {
  console.error('FAIL', name, detail || '');
  failed += 1;
}
function assertEqual(name, actual, expected) {
  if (actual !== expected) fail(name, 'expected ' + JSON.stringify(expected) + ' got ' + JSON.stringify(actual));
  else ok(name);
}

/* Classic float trap: 0.1 + 0.2 levels — avg must stay decimal-clean. */
var levels = [
  { price: '100.1', amount: '0.1' },
  { price: '100.2', amount: '0.2' }
];
var est = impact.estimateMarketImpact({
  size: '0.3',
  quoteSized: false,
  levels: levels,
  mid: '100',
  side: 'BUY',
  scale: 2,
  money: money
});
if (!est.ok) fail('full-fill', est);
else {
  /* cost = 100.1*0.1 + 100.2*0.2 = 10.01 + 20.04 = 30.05; filled 0.3 → avg 100.166… → scale 2 truncate 100.16 */
  assertEqual('avg-decimal-walk', est.avg, '100.16');
  assertEqual('not-partial', est.partial, false);
  if (est.slipPct == null) fail('slip-present');
  else ok('slip-present ' + est.slipPct);
}

/* JSON-number levels must not invent money via toBN(String(n)) quietly painting floats —
   toBN accepts numbers, but float 0.1 is already lossy. Walk still uses BigNumber(String).
   Refuse path: empty when size bad. */
var bad = impact.estimateMarketImpact({
  size: '0',
  levels: levels,
  side: 'BUY',
  scale: 2,
  money: money
});
assertEqual('zero-size', bad.ok, false);
assertEqual('zero-size-reason', bad.reason, 'bad-size');

var empty = impact.estimateMarketImpact({
  size: '1',
  levels: [],
  side: 'SELL',
  scale: 2,
  money: money
});
assertEqual('empty-book', empty.reason, 'no-depth');

/* Partial book: size larger than depth. */
var partial = impact.estimateMarketImpact({
  size: '1',
  quoteSized: false,
  levels: [{ price: '50', amount: '0.25' }],
  mid: '50',
  side: 'BUY',
  scale: 2,
  money: money
});
if (!partial.ok) fail('partial', partial);
else {
  assertEqual('partial-avg', partial.avg, '50.00');
  assertEqual('partial-flag', partial.partial, true);
}

/* Quote-sized market buy: size is quote currency. */
var q = impact.estimateMarketImpact({
  size: '200',
  quoteSized: true,
  levels: [{ price: '100', amount: '3' }],
  mid: '100',
  side: 'BUY',
  scale: 2,
  money: money
});
if (!q.ok) fail('quote-sized', q);
else {
  /* spend 200 quote at 100 → 2 base, avg 100 */
  assertEqual('quote-avg', q.avg, '100.00');
  assertEqual('quote-full', q.partial, false);
}

/* IEEE contrast: float walk of 0.1*0.1 thrice would drift; we take one level. */
var tenths = impact.estimateMarketImpact({
  size: '0.3',
  levels: [
    { price: '1.00', amount: '0.1' },
    { price: '1.00', amount: '0.1' },
    { price: '1.00', amount: '0.1' }
  ],
  mid: '1',
  side: 'BUY',
  scale: 8,
  money: money
});
if (!tenths.ok) fail('tenths', tenths);
else assertEqual('tenths-avg', tenths.avg, '1.00000000');

var label = impact.formatImpactLabel(est, { avg: 'avg', noDepth: 'no depth' });
if (typeof label !== 'string' || label.indexOf('avg ') !== 0) fail('label', label);
else ok('label ' + label);

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('all ix-market-impact golden tests passed');
process.exit(0);
