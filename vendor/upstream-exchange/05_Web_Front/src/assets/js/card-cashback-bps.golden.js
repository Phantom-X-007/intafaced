#!/usr/bin/env node
/**
 * Honesty lock for bank/Cards.vue cashback %.
 * Run from 05_Web_Front: node src/assets/js/card-cashback-bps.golden.js
 *
 * Fail-first: cashbackBps → percent must be ix-money decimal-string math.
 * IEEE `(value / 100).toFixed(2)` is a Number path. Unreadable is a dash,
 * never "0.00%" (that would invent a cashback rate).
 */
'use strict';

var fs = require('fs');
var path = require('path');
var BigNumber = require(path.join(__dirname, 'bignumber.min.js'));
var createIxMoney = require(path.join(__dirname, 'ix-money.js')).createIxMoney;
var m = createIxMoney(BigNumber);
var page = fs.readFileSync(
  path.join(__dirname, '../../pages/intafaced/bank/Cards.vue'),
  'utf8'
);

var failed = 0;
function assert(cond, name) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('ok', name);
  }
}
function equal(actual, expected, name) {
  assert(actual === expected, name + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

assert(page.indexOf("assets/js/ix-money.js") !== -1, 'Cards.vue imports ix-money');
assert(/bps\s*\(\s*value\s*\)/.test(page), 'bps() present');

var bpsBlock = page.match(/bps\s*\(\s*value\s*\)\s*\{[\s\S]*?\n    \}/);
assert(Boolean(bpsBlock), 'bps() body present');
if (bpsBlock) {
  var body = bpsBlock[0];
  assert(body.indexOf('ixMoney.divide') !== -1, 'bps() uses ixMoney.divide');
  assert(body.indexOf('/ 100') === -1, 'bps() does not IEEE-divide by 100');
  assert(body.indexOf('.toFixed') === -1, 'bps() does not Number#toFixed');
  assert(body.indexOf("'—'") !== -1 || body.indexOf('"—"') !== -1, 'unreadable cashback is a dash, not 0.00%');
  assert(body.indexOf('parseFloat') === -1, 'bps() not parseFloat');
  assert(body.indexOf('Number(') === -1, 'bps() not Number(');
}

assert(page.indexOf('(value / 100).toFixed') === -1, 'MUTATION no IEEE (value/100).toFixed on this page');

/* ── decimal path vs the IEEE expression this replaced ───────────────────── */
function legacyBps(value) {
  return (value / 100).toFixed(2) + '%';
}

equal(legacyBps(8.5), '0.09%', 'MUTATION IEEE (8.5/100).toFixed(2) rounds 0.085 up to 0.09');
equal(m.divide('8.5', '100', 2) + '%', '0.08%', 'ix-money divide truncates 8.5 bps to 0.08%');
assert(m.divide('8.5', '100', 2) + '%' !== legacyBps(8.5), 'MUTATION cashback % no longer agrees with IEEE toFixed');

equal(m.divide('150', '100', 2) + '%', '1.50%', '150 bps is 1.50% by decimal divide — not an invented rate');
equal(m.divide('0', '100', 2) + '%', '0.00%', '0 bps is a real zero rate, not unknown');
assert(m.divide(null, '100', 2) === null, 'unreadable bps refuses — never 0.00%');
assert(m.divide('nope', '100', 2) === null, 'garbage bps refuses — never a fabricated rate');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('card-cashback-bps.golden: ok');
process.exit(0);
