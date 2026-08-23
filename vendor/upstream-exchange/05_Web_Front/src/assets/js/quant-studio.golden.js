#!/usr/bin/env node
/**
 * Fail-first: /quant/studio saves a no-code strategy via mutate('quant','studio.save'
 * with a mandatory risk-block field. Run uses existing sandbox.run. Amounts stay
 * decimal strings. Named refuse, never a fabricated return.
 *
 * Run from 05_Web_Front: node src/assets/js/quant-studio.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || 'quant-studio') + ' missing ' + needle);
}

function assertAbsent(value, needle, label) {
  if (value.indexOf(needle) !== -1) throw new Error((label || 'quant-studio') + ' must not contain ' + needle);
}

var page = fs.readFileSync(path.join(root, 'pages/intafaced/quant/Studio.vue'), 'utf8');

assertContains(page, "mutate('quant','studio.save'");
assertContains(page, 'maxDrawdown');
assertContains(page, 'maxNotional');
assertContains(page, 'kill:');
assertContains(page, 'risk:');
assertContains(page, "mutate('quant', 'sandbox.run'");
assertContains(page, 'endpoint="/api/quant/trpc/studio.save"');
assertContains(page, 'endpoint="/api/quant/trpc/sandbox.run"');
assertContains(page, 'intafaced.quant.studio.title');
assertContains(page, 'intafaced.quant.studio.risk');
assertContains(page, 'quant.studio_risk_block_required');
assertContains(page, 'this.risk.maxDrawdown');
assertContains(page, 'this.risk.maxNotional');
assertContains(page, 'this.risk.kill');

assertAbsent(page, 'Number(', 'Studio.vue');
assertAbsent(page, 'parseFloat', 'Studio.vue');
assertAbsent(page, 'parseInt', 'Studio.vue');
if (/pnl:\s*(Number|parseFloat|parseInt)\s*\(/.test(page)) {
  throw new Error('pnl must stay a decimal string');
}
if (/amount:\s*(Number|parseFloat|parseInt)\s*\(/.test(page)) {
  throw new Error('amount must stay a decimal string');
}
if (/maxDrawdown:\s*(Number|parseFloat|parseInt)\s*\(/.test(page)) {
  throw new Error('maxDrawdown must stay a decimal string');
}
if (/maxNotional:\s*(Number|parseFloat|parseInt)\s*\(/.test(page)) {
  throw new Error('maxNotional must stay a decimal string');
}

var routes = fs.readFileSync(path.join(root, 'config/routes.js'), 'utf8');
assertContains(routes, "path: '/quant/studio'", 'routes.js');
assertContains(routes, 'pages/intafaced/quant/Studio', 'routes.js');
assertContains(routes, "path: '/quant'", 'routes.js');
assertContains(routes, 'pages/intafaced/quant/Sandbox', 'routes.js');

var nav = fs.readFileSync(path.join(root, 'config/ix-nav.js'), 'utf8');
assertContains(nav, "to: '/quant/studio'", 'ix-nav.js');
assertContains(nav, 'QUANT_NAV', 'ix-nav.js');

var lang = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');
assertContains(lang, 'studio: {', 'en.js');
assertContains(lang, 'maxDrawdown:', 'en.js');
assertContains(lang, 'maxNotional:', 'en.js');
assertContains(lang, 'riskRequired:', 'en.js');
assertContains(lang, 'navStudio:', 'en.js');

var copy = require('../lang/en.js').intafaced.quant.studio;
if (!copy || typeof copy !== 'object') throw new Error('en.js intafaced.quant.studio must be an object');
['title', 'lead', 'navAria', 'navSandbox', 'navStudio', 'name', 'blocks', 'addBlock', 'side', 'buy', 'sell', 'symbol', 'qty', 'risk', 'maxDrawdown', 'maxNotional', 'kill', 'save', 'run', 'riskRequired', 'saved'].forEach(function (key) {
  if (!copy[key]) throw new Error('en.js missing intafaced.quant.studio.' + key);
});

console.log('quant-studio.golden: ok');
