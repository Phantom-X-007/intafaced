#!/usr/bin/env node
'use strict';

var assert = require('assert');
global.window = {
  LightweightCharts: {
    createChart: function () {},
    CandlestickSeries: {}
  }
};

var KlineChart = require('./kline.js').KlineChart;
var listeners = {};
var lineOptions = null;
var released = null;
var staged = [];
var host = {
  addEventListener: function (type, handler) { listeners[type] = handler; },
  removeEventListener: function () {},
  getBoundingClientRect: function () { return { top: 0 }; },
  setPointerCapture: function () {},
  releasePointerCapture: function () {},
  hasPointerCapture: function () { return true; }
};
var chart = new KlineChart({ hostEl: host });
chart._series = {
  createPriceLine: function (options) {
    lineOptions = options;
    return { applyOptions: function (next) { lineOptions = Object.assign({}, lineOptions, next); } };
  },
  removePriceLine: function () {},
  priceToCoordinate: function (price) { return 200 - price * 10; }
};
chart._installRepricePointer();
assert.strictEqual(chart.setRepriceStage({
  price: '10',
  tickSize: '0.5',
  label: 'abc',
  onStage: function (price, source) { staged.push([price, source]); },
  onRelease: function (price) { released = price; }
}), true);
assert.strictEqual(lineOptions.price, 10);
assert.strictEqual(lineOptions.title, 'STAGED abc');

function pointer(y) {
  return {
    button: 0,
    pointerId: 7,
    clientY: y,
    preventDefault: function () {},
    stopPropagation: function () {}
  };
}

listeners.pointerdown(pointer(100));
listeners.pointermove(pointer(90));
assert.deepStrictEqual(staged[staged.length - 1], ['11', 'pointer']);
assert.strictEqual(lineOptions.price, 11);
listeners.pointerup(pointer(90));
assert.strictEqual(released, '11', 'release reports the draft only');
assert.strictEqual(chart.nudgeReprice(-1), '10.5');
assert.deepStrictEqual(staged[staged.length - 1], ['10.5', 'keyboard']);

chart.setRepriceStage(null);
assert.strictEqual(chart.nudgeReprice(1), null, 'cleared stage cannot change');
assert.strictEqual(chart.setRepriceStage({ price: '10', tickSize: '' }), false, 'missing tick refuses line');

console.log('chart-reprice-pointer golden passed');
