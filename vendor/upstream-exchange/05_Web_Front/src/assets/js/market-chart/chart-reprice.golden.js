#!/usr/bin/env node
'use strict';

var assert = require('assert');
var reprice = require('./chart-reprice.js');

var huge = '9007199254740993.000000000000000001';
var tick = '0.000000000000000001';
assert.strictEqual(reprice.step(huge, tick, 1), '9007199254740993.000000000000000002');
assert.strictEqual(reprice.step(huge, tick, -1), '9007199254740993');
assert.strictEqual(reprice.delta(huge, reprice.step(huge, tick, 1)), tick);
assert.strictEqual(reprice.snap('12.3456', '0.01'), '12.35');
assert.strictEqual(reprice.snap('12.3449', '0.01'), '12.34');
assert.strictEqual(reprice.step('0.01', '0.01', -1), null, 'non-positive stage refused');
assert.strictEqual(reprice.step('1', '', 1), null, 'missing venue tick refused');
assert.strictEqual(reprice.step('1', '0', 1), null, 'zero venue tick refused');
assert.strictEqual(reprice.step('1', '0.1', 0.5), null, 'fractional tick count refused');

console.log('chart-reprice golden passed');
