#!/usr/bin/env node
/**
 * Fail-first proof that /exchange wires copy grant/kill + placeMirror after grant.
 * Run from 05_Web_Front:  node src/assets/js/exchange-copy-session.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var exchange = fs.readFileSync(path.join(__dirname, '../../pages/exchange/Exchange.vue'), 'utf8');
var en = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

function assert(cond, name) {
  if (!cond) throw new Error('exchange-copy-session.golden FAIL ' + name);
}

function assertContains(value, needle) {
  if (value.indexOf(needle) === -1) throw new Error('exchange-copy-session.golden missing ' + needle);
}

assertContains(exchange, "mutate('trade', 'copy.grantSessionKey'");
assertContains(exchange, "mutate('trade', 'copy.killSessionKey'");
assertContains(exchange, "mutate('trade', 'copy.placeMirror'");
assertContains(exchange, "mutate('trade', 'copy.planMirror'");
assertContains(exchange, 'grantCopySession');
assertContains(exchange, 'killCopySession');
assertContains(exchange, 'placeCopyMirror');
assertContains(exchange, 'qty: qty');
assertContains(exchange, 'notional: notional');
assert(exchange.indexOf('id="ix-copy-place-qty" type="text"') !== -1, 'place qty is type=text');
assert(exchange.indexOf('id="ix-copy-place-notional" type="text"') !== -1, 'place notional is type=text');
assert(!/qty:\s*(Number|parseFloat|parseInt)\(/.test(exchange), 'place qty stays a string');
assert(!/notional:\s*(Number|parseFloat|parseInt)\(/.test(exchange), 'place notional stays a string');
assert(exchange.indexOf('grantCopySession') < exchange.indexOf('placeCopyMirror'), 'grant before place in the card');
assertContains(en, 'grantSession');
assertContains(en, 'killSession');
assertContains(en, 'placeMirror');
assertContains(en, 'trade.copy_session_key_missing');

console.log('exchange-copy-session.golden: ok');
