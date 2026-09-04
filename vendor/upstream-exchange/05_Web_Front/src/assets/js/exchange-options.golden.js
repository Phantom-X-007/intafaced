#!/usr/bin/env node
/**
 * Fail-first: /exchange options mode is refuse-closed without a full chain.
 * Paper label stays. No fake IV. Place must not POST a generic limit
 * (toCreateOrderBody drops `kind`).
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

function pane(src, startNeedle, endNeedle) {
  var start = src.indexOf(startNeedle);
  assert(start !== -1, 'pane start ' + startNeedle);
  var end = src.indexOf(endNeedle, start + startNeedle.length);
  assert(end !== -1, 'pane end ' + endNeedle);
  return src.slice(start, end);
}

var page = fs.readFileSync(path.join(root, 'pages/exchange/Exchange.vue'), 'utf8');
var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');
var trade = fs.readFileSync(path.join(root, 'assets/js/ix-trade.js'), 'utf8');
var options = pane(page, 'v-else-if="deskMode === \'options\'"', 'v-else-if="deskMode === \'copy\'"');
var bodyFn = pane(trade, 'function toCreateOrderBody(input)', 'function toReplaceOrderBody');

assertContains(page, "deskMode === 'options'");
assertContains(options, 'intafaced.exchange.options.lead');
assertContains(options, 'intafaced.exchange.options.empty');
assertContains(options, 'intafaced.exchange.options.chainUnavailable');
assertContains(options, 'IxState');
assertContains(options, 'reason="no_surface"');
assertContains(options, 'endpoint="options.chain"');
assertAbsent(options, 'placePaperOptionsOrder', 'options pane');
assertAbsent(options, "rest('/orders'", 'options pane');
assertAbsent(options, "kind: 'options'", 'options pane');
assertAbsent(options, 'optionsQty', 'options pane');
assertAbsent(options, 'optionsPrice', 'options pane');
assertAbsent(page, 'placePaperOptionsOrder');
assertAbsent(bodyFn, 'kind', 'toCreateOrderBody must drop kind');
assertAbsent(options, 'implied volatility 0.', 'options pane');
assertAbsent(options, 'fake IV', 'options pane');

assertContains(en, 'Paper label stays');
assertContains(en, 'Empty book stays empty');
assertContains(en, 'never invents a settlement asset, IV, or a chain');
assertContains(en, 'Options chain unavailable');
assertContains(en, 'no bid/ask/IV/delta');
assertContains(en, 'trade.options_chain_unavailable');
assertContains(en, 'toCreateOrderBody drops kind');
assertAbsent(en, 'Place paper order');
assert(en.indexOf('options:') !== -1, 'en.js has options keys');

console.log('exchange-options.golden: ok');
