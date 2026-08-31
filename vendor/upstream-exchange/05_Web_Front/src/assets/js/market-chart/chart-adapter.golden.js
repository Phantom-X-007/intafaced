#!/usr/bin/env node
'use strict';

var assert = require('assert');
var adapter = require('./chart-adapter.js');
var ohlcv = require('../kline-ohlcv.js');

var full = adapter.buildIndicatorPlan({ rsi: true, macd: true }, 100000000);
assert.deepStrictEqual(full.map(function (row) { return row.id; }), [
  'rsi', 'macdHistogram', 'macd', 'macdSignal'
]);
assert.deepStrictEqual(full.map(function (row) { return row.pane; }), [1, 2, 2, 2]);
assert.strictEqual(full[1].options.priceFormat.precision, 8, 'MACD uses instrument precision');
assert.strictEqual(full[1].options.priceFormat.minMove, 0.00000001, 'MACD uses instrument tick');

var macdOnly = adapter.buildIndicatorPlan({ rsi: false, macd: true }, 100);
assert.deepStrictEqual(macdOnly.map(function (row) { return row.pane; }), [1, 1, 1]);
assert.strictEqual(macdOnly[0].options.priceFormat.precision, 2);
assert.deepStrictEqual(adapter.buildIndicatorPlan({ rsi: false, macd: false }, 100), []);
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(adapter.buildIndicatorPlan({ rsi: false, macd: true }, null)[0].options, 'priceFormat'),
  false,
  'missing instrument scale does not invent MACD precision'
);

var calls = [];
var mockChart = {
  addSeries: function (ctor, options, pane) {
    calls.push({ ctor: ctor, options: options, pane: pane });
    return { setData: function () {} };
  }
};
var constructors = { LineSeries: 'line-ctor', HistogramSeries: 'histogram-ctor' };
var mounted = adapter.mountIndicatorPlan(mockChart, constructors, full);
assert.strictEqual(calls.length, 4);
assert.strictEqual(calls[0].ctor, 'line-ctor');
assert.strictEqual(calls[1].ctor, 'histogram-ctor');
assert.strictEqual(mounted.macdSignal != null, true);

var wire = [];
for (var i = 1; i <= 40; i++) {
  var close = String(i) + '.00000000';
  wire.push([i, close, close, close, close, '1']);
}
wire.push([41, 41, 41, 41, 41, 1]); // JSON-number money is refused.
var accepted = ohlcv.barsFromHistory(wire);
assert.strictEqual(accepted.length, 40, 'only decimal-string candle rows reach the adapter');
var data = adapter.indicatorData(accepted);
assert.strictEqual(data.rsi.length, 26);
assert.strictEqual(data.macd.length, 7);
assert.strictEqual(data.macdSignal.length, 7);
assert.strictEqual(data.macdHistogram.length, 7);
assert.strictEqual(data.macd[0].time, 34, 'indicator output keeps accepted candle time');

console.log('chart adapter golden passed');
