#!/usr/bin/env node
/**
 * Fail-first: /quant pastes strategy source and calls mutate('quant', 'sandbox.run'.
 * Amounts stay decimal strings. Named refuse, never a fabricated PnL.
 *
 * Run from 05_Web_Front: node src/assets/js/quant-sandbox.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || 'quant-sandbox') + ' missing ' + needle);
}

function assertAbsent(value, needle, label) {
  if (value.indexOf(needle) !== -1) throw new Error((label || 'quant-sandbox') + ' must not contain ' + needle);
}

var page = fs.readFileSync(path.join(root, 'pages/intafaced/quant/Sandbox.vue'), 'utf8');

assertContains(page, "mutate('quant', 'sandbox.run'");
assertContains(page, "query('quant', 'sandbox.capabilities'");
assertContains(page, 'endpoint="/api/quant/trpc/sandbox.run"');
assertContains(page, 'language: this.language');
assertContains(page, 'source: this.source');
assertContains(page, 'cash: this.cash');
assertContains(page, 'quant.sandbox_unwired');
assertContains(page, 'intafaced.quant.title');
assertContains(page, 'intafaced.quant.pnl');
assertContains(page, 'result.data && result.data.pnl');
assertContains(page, 'python');
assertContains(page, 'javascript');

assertAbsent(page, 'Number(', 'Sandbox.vue');
assertAbsent(page, 'parseFloat', 'Sandbox.vue');
assertAbsent(page, 'parseInt', 'Sandbox.vue');
if (/pnl:\s*(Number|parseFloat|parseInt)\s*\(/.test(page)) {
  throw new Error('pnl must stay a decimal string');
}
if (/amount:\s*(Number|parseFloat|parseInt)\s*\(/.test(page)) {
  throw new Error('amount must stay a decimal string');
}

var routes = fs.readFileSync(path.join(root, 'config/routes.js'), 'utf8');
assertContains(routes, "path: '/quant'", 'routes.js');
assertContains(routes, 'pages/intafaced/quant/Sandbox', 'routes.js');

var lang = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');
assertContains(lang, 'sandboxUnwired:', 'en.js');
assertContains(lang, 'venueUnset:', 'en.js');
assertContains(lang, 'run:', 'en.js');
assertContains(lang, 'pnl:', 'en.js');
assertAbsent(lang, 'intafaced.quant.market', 'en.js must not claim Lane G market keys');

console.log('quant-sandbox.golden: ok');
