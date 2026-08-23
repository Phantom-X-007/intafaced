#!/usr/bin/env node
/**
 * Fail-first proof that /exchange wires copy.follow with decimal-string caps.
 * Run from 05_Web_Front:  node src/assets/js/exchange-copy-follow.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var exchange = fs.readFileSync(path.join(__dirname, '../../pages/exchange/Exchange.vue'), 'utf8');
var en = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

function assert(cond, name) {
  if (!cond) throw new Error('exchange-copy-follow.golden FAIL ' + name);
}

function assertContains(value, needle) {
  if (value.indexOf(needle) === -1) throw new Error('exchange-copy-follow.golden missing ' + needle);
}

assertContains(exchange, "mutate('trade', 'copy.follow'");
assertContains(exchange, "query('trade', 'copy.listMyFollows'");
assertContains(exchange, 'maxNotionalPerOrder: copyMaxNotionalPerOrder');
assertContains(exchange, 'maxAggregateExposure: copyMaxAggregateExposure');
assertContains(exchange, 'var copyMaxNotionalPerOrder = String(');
assertContains(exchange, 'var copyMaxAggregateExposure = String(');

assert(!/maxNotionalPerOrder:\s*(Number|parseFloat|parseInt)\(/.test(exchange), 'maxNotionalPerOrder stays a string');
assert(!/maxAggregateExposure:\s*(Number|parseFloat|parseInt)\(/.test(exchange), 'maxAggregateExposure stays a string');
assert(exchange.indexOf('id="ix-copy-max-notional" type="text"') !== -1, 'notional input is type=text');
assert(exchange.indexOf('id="ix-copy-max-exposure" type="text"') !== -1, 'exposure input is type=text');
assertContains(exchange, "mutate('trade', 'copy.grantSessionKey'");
assert(
  exchange.indexOf("copy.placeMirror") === -1 || exchange.indexOf("copy.grantSessionKey") !== -1,
  'placeMirror is allowed only AFTER grant',
);
assert(exchange.indexOf('TRADE_COPY_PLACE_MIRROR') === -1, 'must not enable TRADE_COPY_PLACE_MIRROR');
assert(en.indexOf('intafaced.exchange.copy') !== -1 || /exchange:\s*\{[\s\S]*copy:\s*\{/.test(en), 'en.js has intafaced.exchange.copy keys');
assertContains(en, 'trade.copy_jurisdiction_blank');
assertContains(en, 'trade.copy_place_disabled');

console.log('exchange-copy-follow.golden: ok');
