'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../..');
var app = fs.readFileSync(path.join(root, 'App.vue'), 'utf8');
var css = fs.readFileSync(path.join(root, 'assets/css/intafaced.css'), 'utf8');
var modules = [
  ['Market', 'MARKET'],
  ['Support', 'SUPPORT'],
  ['Ops', 'OPS'],
  ['Portfolio', 'PORTFOLIO'],
  ['Token', 'TOKEN'],
  ['Agents', 'AGENTS'],
  ['Blueprint', 'BLUEPRINT'],
  ['Protocol', 'PROTOCOL'],
  ['Dex', 'DEX'],
  ['Chain', 'CHAIN'],
  ['Academy', 'ACADEMY'],
  ['Launch', 'LAUNCH']
];
var routedModules = [
  ['quant/Sandbox', 'QUANT'],
  ['quant/Studio', 'QUANT'],
  ['quant/Backtest', 'QUANT'],
  ['execution/Arb', 'EXECUTION'],
  ['Predict', 'PREDICT'],
  ['Mining', 'MINING']
];

function has(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || 'Platform OS') + ' missing ' + needle);
}

has(app, 'isPlatformModuleRoute()', 'shell predicate');
has(app, 'return this.platformModuleLabel || "MONEY"', 'shell label');
has(app, 'to="/platform" class="money-os-chip">Platform', 'platform return');
has(app, 'return this.isAuthRoute || this.isPlatformModuleRoute', 'shell route');
has(app, 'p === "/p2p" || p === "/otc"', 'P2P and OTC shared shell');
has(css, '.bank-page', 'shared N4 shell');
has(css, '@media screen and (max-width: 768px)', 'responsive shell');

modules.forEach(function(entry) {
  var source = fs.readFileSync(path.join(root, 'pages/intafaced/' + entry[0] + '.vue'), 'utf8');
  has(source, 'class="ix-page bank-page platform-module-page"', entry[0] + ' shell');
  has(source, '<details class="bank-details">', entry[0] + ' details');
  has(app, entry[1], entry[0] + ' module label');
  if (source.indexOf('<IxState') !== -1) has(source, '<IxState compact', entry[0] + ' compact state');
  if (source.indexOf('Number(') !== -1) throw new Error(entry[0] + ' converts a value with Number');
  if (source.indexOf('parseFloat(') !== -1) throw new Error(entry[0] + ' converts a value with parseFloat');
});

routedModules.forEach(function(entry) {
  var source = fs.readFileSync(path.join(root, 'pages/intafaced/' + entry[0] + '.vue'), 'utf8');
  has(source, 'class="ix-page bank-page platform-module-page"', entry[0] + ' shell');
  has(source, '<details class="bank-details">', entry[0] + ' details');
  has(app, entry[1], entry[0] + ' module label');
  if (source.indexOf('<IxState') !== -1) has(source, '<IxState compact', entry[0] + ' compact state');
});

var client = fs.readFileSync(path.join(root, 'config/intafaced.js'), 'utf8');
['quant', 'execution', 'predict', 'mining'].forEach(function(key) {
  has(client, "key: '" + key + "'", key + ' platform tile');
});
has(client, "probePath: '/api/mining/health'", 'mining health probe');

console.log('platform-os.golden: ok');
