'use strict';

var fs = require('fs');
var path = require('path');
var fixed = require('../fixed-decimal.js');
var a11y = require('./chart-accessibility.js');

function bar(time, open, high, low, close) {
  return { time: time, open: fixed.parse(open), high: fixed.parse(high), low: fixed.parse(low), close: fixed.parse(close) };
}

var rows = [
  bar(1, '9007199254740992.000000000000000001', '9007199254740992.000000000000000004', '9007199254740992', '9007199254740992.000000000000000002'),
  bar(2, '9007199254740992.000000000000000002', '9007199254740992.000000000000000005', '9007199254740992.000000000000000001', '9007199254740992.000000000000000003')
];

var latest = a11y.snapshot(rows, 0);
if (latest.close !== '9007199254740992.000000000000000003') throw new Error('latest close lost exactness');
if (latest.index !== 2 || latest.total !== 2) throw new Error('latest position is wrong');
var older = a11y.snapshot(rows, 1);
if (older.close !== '9007199254740992.000000000000000002') throw new Error('older candle navigation failed');
if (a11y.snapshot([], 0) !== null) throw new Error('empty history must have no invented summary');
if (a11y.clampCursor(2, 99) !== 1 || a11y.clampCursor(2, -4) !== 0) throw new Error('cursor clamp failed');

var shellRoot = path.resolve(__dirname, '../../..');
var exchange = fs.readFileSync(path.join(shellRoot, 'pages/exchange/Exchange.vue'), 'utf8');
var kline = fs.readFileSync(path.join(__dirname, 'kline.js'), 'utf8');
if (exchange.indexOf('tabindex="chartStatus === \'ok\' ? \'0\' : \'-1\'"') === -1) throw new Error('chart host is not keyboard focusable when available');
if (exchange.indexOf('@keydown="onChartKeydown"') === -1) throw new Error('chart host has no keyboard navigation');
if (exchange.indexOf('aria-describedby="ix-chart-summary ix-chart-provenance"') === -1) throw new Error('chart canvas lacks equivalent text');
if (exchange.indexOf('Fit chart') === -1 || exchange.indexOf('Follow latest') === -1) throw new Error('explicit view controls missing');
if (kline.indexOf('timeScale().fitContent()') === -1 || kline.indexOf('timeScale().scrollToRealTime()') === -1) throw new Error('view controls are not bound to chart APIs');

console.log('chart-accessibility.golden: ok');
