#!/usr/bin/env node
/**
 * Fail-first: /exchange options desk places a paper order (kind=options).
 * Empty stays empty. Amounts are decimal strings. No invented settlement asset.
 *
 * Run from 05_Web_Front: node src/assets/js/exchange-options.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || 'exchange-options') + ' missing ' + needle);
}

function assertAbsent(value, needle, label) {
  if (value.indexOf(needle) !== -1) throw new Error((label || 'exchange-options') + ' must not contain ' + needle);
}

function assert(cond, name) {
  if (!cond) throw new Error('exchange-options.golden FAIL ' + name);
}

var page = fs.readFileSync(path.join(root, 'pages/exchange/Exchange.vue'), 'utf8');
var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

assertContains(page, "deskMode === 'options'");
assertContains(page, 'placePaperOptionsOrder');
assertContains(page, "kind: 'options'");
assertContains(page, "rest('/orders'");
assertContains(page, 'intafaced.exchange.options.title');
assertContains(page, 'intafaced.exchange.options.empty');
assertContains(page, 'var qty = String(');
assertContains(page, 'var price = String(');
assertContains(page, 'ixMoney.isPositive(qty)');
assertAbsent(page, 'parseFloat(this.optionsQty');
assertAbsent(page, 'Number(this.optionsQty');
assertAbsent(page, 'parseFloat(this.optionsPrice');
assertAbsent(page, 'USDT settlement');

assertContains(en, 'Empty book stays empty');
assertContains(en, 'never invents a settlement asset');
assertContains(en, 'Place paper order');
assert(en.indexOf('options:') !== -1, 'en.js has options keys');

console.log('exchange-options.golden: ok');
