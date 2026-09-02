#!/usr/bin/env node
'use strict';

var assert = require('assert');
var fixed = require('./fixed-decimal.js');

var cases = [
  '0', '-0', '9007199254740993', '-9007199254740993',
  '0.000000000000000001', '-0.000000000000000001',
  '12345678901234567890.123456789012345678',
  '-99999999999999999999.999999999999999999'
];

cases.forEach(function (wire) {
  var parsed = fixed.parse(wire);
  assert(parsed, 'accept ' + wire);
  assert.strictEqual(typeof parsed.units, 'bigint', 'bigint units ' + wire);
  var canonical = wire === '-0' ? '0' : wire;
  assert.strictEqual(fixed.toString(parsed), canonical, 'exact round trip ' + wire);
});

/* Generated round-trip/additive-inverse property across signs and scales. */
for (var scale = 0; scale <= 18; scale += 3) {
  for (var seed = 1; seed <= 9; seed++) {
    var digits = String(seed).repeat(38);
    var wire = scale ? digits.slice(0, -scale) + '.' + digits.slice(-scale) : digits;
    if (seed % 2 === 0) wire = '-' + wire;
    var value = fixed.parse(wire);
    var reparsed = fixed.parse(fixed.toString(value));
    assert.strictEqual(fixed.compare(value, reparsed), 0, 'round-trip property ' + scale + '/' + seed);
    assert.strictEqual(fixed.toString(fixed.add(value, fixed.negate(value))), '0', 'additive inverse ' + scale + '/' + seed);
  }
}

assert.strictEqual(fixed.parse(1), null, 'JSON number refused');
assert.strictEqual(fixed.parse('1e3'), null, 'exponent notation refused');
assert.strictEqual(fixed.parse('NaN'), null, 'non-decimal refused');

var adjacentA = fixed.parse('9007199254740993.000000000000000001');
var adjacentB = fixed.parse('9007199254740993.000000000000000002');
assert.strictEqual(fixed.compare(adjacentA, adjacentB), -1, 'adjacent ticks stay ordered above 2^53');
assert.strictEqual(
  fixed.toString(fixed.add(adjacentA, fixed.parse('0.000000000000000001'))),
  fixed.toString(adjacentB),
  'adjacent tick addition exact'
);
assert.strictEqual(
  fixed.toString(fixed.subtract(adjacentB, adjacentA)),
  '0.000000000000000001',
  'adjacent tick subtraction exact'
);
assert.strictEqual(
  fixed.toString(fixed.snapToIncrement(fixed.parse('9007199254740993.0000000000000000016'), fixed.parse('0.000000000000000001'))),
  '9007199254740993.000000000000000002',
  'snap stays exact above 2^53'
);
assert.strictEqual(
  fixed.toString(fixed.snapToIncrement(fixed.parse('-1.25'), fixed.parse('0.5'))),
  '-1.5',
  'negative half snaps away from zero'
);
assert.strictEqual(fixed.snapToIncrement(fixed.parse('1'), fixed.parse('0')), null, 'zero tick refused');
assert.strictEqual(fixed.toString(fixed.divideInteger(fixed.parse('1'), 3, 18)), '0.333333333333333333');
assert.strictEqual(fixed.toString(fixed.ratioPercent(fixed.parse('1'), fixed.parse('4'), 18)), '25');

/* The only permitted lossy operation is named and does not mutate canonical state. */
var before = fixed.toString(adjacentA);
assert.strictEqual(typeof fixed.toRenderNumber(adjacentA), 'number');
assert.strictEqual(fixed.toString(adjacentA), before);

console.log('fixed-decimal golden passed');
