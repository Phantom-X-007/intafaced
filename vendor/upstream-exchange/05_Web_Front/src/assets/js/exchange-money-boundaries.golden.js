#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var money = require(path.join(__dirname, 'ix-money.js'));
var trade = require(path.join(__dirname, 'ix-trade.js'));
var exchange = fs.readFileSync(
  path.join(__dirname, '../../pages/exchange/Exchange.vue'),
  'utf8'
);

var failed = 0;
function assert(condition, message) {
  if (!condition) {
    console.error('FAIL', message);
    failed += 1;
  } else {
    console.log('ok', message);
  }
}
function equal(actual, expected, message) {
  assert(actual === expected, message + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

/* A rate whose percentage is an adjacent value above Number.MAX_SAFE_INTEGER. */
equal(
  trade.formatPercent('90071992547409.9301'),
  '+9007199254740993.01%',
  'ticker percent never crosses IEEE Number'
);
equal(trade.formatPercent('-0.0001'), '-0.01%', 'negative ticker percent keeps sign');
equal(trade.formatPercent('0'), '0.00%', 'zero ticker percent is unsigned');
equal(trade.formatPercent('unavailable'), null, 'unreadable ticker percent refuses');

equal(
  money.percentRatio('9007199254740993.000000000000000001', '9007199254740993.000000000000000002', 18),
  '99.999999999999999999',
  'partial-fill percent distinguishes adjacent 38,18 values'
);
assert(
  money.compare('9007199254740993.000000000000000001', '9007199254740993.000000000000000002') < 0,
  'partial-fill decision distinguishes adjacent 38,18 values'
);

assert(exchange.indexOf('this.num(') === -1, 'Exchange has no generic float money escape hatch');
assert(exchange.indexOf('ixMoney.toFloat(') === -1, 'Exchange never converts economic state to Number');
assert(/lastPrice\(\)\s*{[\s\S]*?String\(value\)/.test(exchange), 'last price remains a decimal string');
assert(/'currentCoin\.close':[\s\S]*?ixMoney\.compare\(next, this\.lastTick\)/.test(exchange), 'tick direction uses exact comparison');
assert(/fiatValue\(\)[\s\S]*?ixMoney\.multiply\(this\.currentCoin\.usdRate, this\.CNYRate, 2\)/.test(exchange), 'fiat display uses exact multiplication');
assert(/fillTitle\(row\)[\s\S]*?ixMoney\.percentRatio\(row\.tradedAmount, row\.amount, 1\)/.test(exchange), 'fill percent uses exact ratio');
assert(/isPartialFill\(row\)[\s\S]*?ixMoney\.compare\(row\.tradedAmount, row\.amount\) < 0/.test(exchange), 'partial-fill classification uses exact comparison');

if (failed) process.exit(1);
console.log('all exchange money-boundary golden tests passed');
