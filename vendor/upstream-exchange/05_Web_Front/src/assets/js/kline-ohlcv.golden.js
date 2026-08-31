#!/usr/bin/env node
'use strict';
var path = require('path');
var k = require(path.join(__dirname, 'kline-ohlcv.js'));
var fixed = require(path.join(__dirname, 'fixed-decimal.js'));
var failed = 0;
function ok(n) { console.log('ok:', n); }
function fail(n, d) { console.error('FAIL', n, d || ''); failed += 1; }

var strings = k.barsFromHistory([
  [1700000000000, '100.1', '101', '99.5', '100.5', '1']
]);
if (strings.length !== 1) fail('accept-string', strings);
else {
  ok('accept-string');
  if (strings[0].time !== 1700000000) fail('ms-to-s', strings[0].time);
  else ok('ms-to-s');
  if (fixed.toString(strings[0].open) !== '100.1') fail('open', fixed.toString(strings[0].open));
  else ok('open');
  if (typeof strings[0].open.units !== 'bigint') fail('scaled-bigint-canonical');
  else ok('scaled-bigint-canonical');
}

var exact = k.barsFromHistory([
  [3, '12345678901234567890.123456789012345678', '12345678901234567890.123456789012345679', '-0.000000000000000001', '9007199254740993.000000000000000001', '0']
]);
if (exact.length !== 1) fail('adversarial-row-accepted');
else {
  ok('adversarial-row-accepted');
  if (fixed.toString(exact[0].open) !== '12345678901234567890.123456789012345678') fail('38-digit-18-decimal');
  else ok('38-digit-18-decimal');
  if (fixed.compare(exact[0].open, exact[0].high) !== -1) fail('adjacent-tick-order');
  else ok('adjacent-tick-order');
  if (fixed.toString(exact[0].low) !== '-0.000000000000000001') fail('negative');
  else ok('negative');
  if (fixed.toString(exact[0].volume) !== '0') fail('zero-volume');
  else ok('zero-volume');
}

var numbers = k.barsFromHistory([
  [1700000000, 100.1, 101, 99.5, 100.5, 1]
]);
if (numbers.length !== 0) fail('refuse-json-number', numbers);
else ok('refuse-json-number');

var mixed = k.barsFromHistory([
  [1, 1, 1, 1, 1],
  [2, '2', '2', '2', '2']
]);
if (mixed.length !== 1 || mixed[0].time !== 2) fail('mixed', mixed);
else ok('mixed-keep-string-only');

if (k.barFromWireRow(null) !== null) fail('null-row');
else ok('null-row');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('all kline-ohlcv golden tests passed');
process.exit(0);
