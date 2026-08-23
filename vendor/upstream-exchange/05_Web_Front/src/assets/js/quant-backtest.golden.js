#!/usr/bin/env node
/**
 * Fail-first: /quant/backtest calls mutate('quant','backtest.run' with walk-forward
 * and out-of-sample. Metrics come from fills. Missing lake is a named refuse.
 * No invented candles. Amounts stay decimal strings.
 *
 * Run from 05_Web_Front: node src/assets/js/quant-backtest.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || 'quant-backtest') + ' missing ' + needle);
}

function assertAbsent(value, needle, label) {
  if (value.indexOf(needle) !== -1) throw new Error((label || 'quant-backtest') + ' must not contain ' + needle);
}

var page = fs.readFileSync(path.join(root, 'pages/intafaced/quant/Backtest.vue'), 'utf8');

assertContains(page, "mutate('quant','backtest.run'");
assertContains(page, 'walkForward:');
assertContains(page, 'outOfSampleStatus:');
assertContains(page, 'inSampleFrom');
assertContains(page, 'outOfSampleFrom');
assertContains(page, 'quant.backtest_lake_missing');
assertContains(page, 'quant.backtest_fills_missing');
assertContains(page, 'endpoint="/api/quant/trpc/backtest.run"');
assertContains(page, 'intafaced.quant.backtest.title');
assertContains(page, 'result.data.inSample.notional');
assertContains(page, 'result.data.outOfSample.notional');

assertAbsent(page, 'Number(', 'Backtest.vue');
assertAbsent(page, 'parseFloat', 'Backtest.vue');
assertAbsent(page, 'parseInt', 'Backtest.vue');
assertAbsent(page, 'candle', 'Backtest.vue');
if (/notional:\s*(Number|parseFloat|parseInt)\s*\(/.test(page)) {
  throw new Error('notional must stay a decimal string');
}

var routes = fs.readFileSync(path.join(root, 'config/routes.js'), 'utf8');
assertContains(routes, "path: '/quant/backtest'", 'routes.js');
assertContains(routes, 'pages/intafaced/quant/Backtest', 'routes.js');

var nav = fs.readFileSync(path.join(root, 'config/ix-nav.js'), 'utf8');
assertContains(nav, "to: '/quant/backtest'", 'ix-nav.js');

var lang = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');
assertContains(lang, 'backtest: {', 'en.js');
assertContains(lang, 'lakeMissing:', 'en.js');
assertContains(lang, 'walkForward:', 'en.js');

var copy = require('../lang/en.js').intafaced.quant.backtest;
if (!copy || typeof copy !== 'object') throw new Error('en.js intafaced.quant.backtest must be an object');
['title', 'lead', 'nav', 'run', 'walkForward', 'lakeMissing', 'inSampleNotional', 'outOfSampleNotional'].forEach(function (key) {
  if (!copy[key]) throw new Error('en.js missing intafaced.quant.backtest.' + key);
});

console.log('quant-backtest.golden: ok');
