#!/usr/bin/env node
/**
 * Golden tests for withdraw net arithmetic.
 * Run: node src/assets/js/withdraw-math.golden.js
 * Exit 0 = all pass; non-zero = failure (prints first miss).
 */
'use strict';

var path = require('path');
var BigNumber = require(path.join(__dirname, 'bignumber.min.js'));
var createWithdrawMath = require(path.join(__dirname, 'withdraw-math.js')).createWithdrawMath;
var m = createWithdrawMath(BigNumber);

var failed = 0;
function assertEqual(name, actual, expected) {
  if (actual !== expected) {
    console.error('FAIL', name, 'expected', JSON.stringify(expected), 'got', JSON.stringify(actual));
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

function assertOk(name, result, expectedNet) {
  if (!result.ok) {
    console.error('FAIL', name, 'expected ok net', expectedNet, 'got', result);
    failed += 1;
    return;
  }
  assertEqual(name + '.net', result.net, expectedNet);
}

function assertErr(name, result, code) {
  if (result.ok || result.error !== code) {
    console.error('FAIL', name, 'expected error', code, 'got', result);
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

// Classic float trap: 0.3 - 0.1 with IEEE float is not 0.2
assertOk('float-trap-0.3-0.1', m.netReceive('0.3', '0.1', 8), '0.20000000');

// 0.1 + 0.2 style: amount 1.1 fee 0.2 → 0.9
assertOk('1.1-minus-0.2', m.netReceive('1.1', '0.2', 8), '0.90000000');

// Scale truncation ROUND_DOWN (never round up net)
assertOk('round-down-scale-2', m.netReceive('1.009', '0.001', 2), '1.00');
assertOk('round-down-scale-0', m.netReceive('10.9', '0.4', 0), '10');

// Exact zeros at scale
assertOk('exact-zero-net', m.netReceive('1', '1', 8), '0.00000000');

// Fee exceeds amount
assertErr('fee-exceeds', m.netReceive('1', '2', 8), 'fee_exceeds_amount');

// Negatives refused
assertErr('neg-amount', m.netReceive('-1', '0', 8), 'negative_not_allowed');
assertErr('neg-fee', m.netReceive('1', '-0.01', 8), 'negative_not_allowed');

// Invalid inputs
assertErr('empty-amount', m.netReceive('', '0', 8), 'invalid_amount_or_fee');
assertErr('nan-fee', m.netReceive('1', 'nope', 8), 'invalid_amount_or_fee');
assertErr('bad-scale', m.netReceive('1', '0', 99), 'invalid_scale');

// Large-ish crypto scale 18
assertOk(
  'scale-18',
  m.netReceive('100.123456789012345678', '0.000000000000000001', 18),
  '100.123456789012345677'
);

// formatAmount never invents zero on bad input
if (m.formatAmount(null, 8) !== null) {
  console.error('FAIL formatAmount-null should be null');
  failed += 1;
} else {
  console.log('ok formatAmount-null');
}
assertEqual('formatAmount-round-down', m.formatAmount('1.999', 2), '1.99');

if (failed > 0) {
  console.error('\n' + failed + ' golden test(s) failed');
  process.exit(1);
}
console.log('\nall golden tests passed');
process.exit(0);
