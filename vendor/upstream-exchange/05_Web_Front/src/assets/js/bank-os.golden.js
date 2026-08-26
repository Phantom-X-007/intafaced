#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}
function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || needle) + ' missing');
}
function assertAbsent(value, needle, label) {
  if (value.indexOf(needle) !== -1) throw new Error((label || needle) + ' must be absent');
}

var app = read('App.vue');
var overview = read('pages/intafaced/Bank.vue');
var nav = read('config/ix-nav.js');
var css = read('assets/css/intafaced.css');
var cards = read('pages/intafaced/bank/Cards.vue');
var ramps = read('pages/intafaced/bank/Ramps.vue');
var childPages = ['Spaces', 'Transfers', 'Earn', 'Loans', 'Cards', 'Ramps', 'Analytics', 'Business'];

assertContains(app, 'p === "/bank" || p.indexOf("/bank/") === 0', 'bank OS route matcher');
assertContains(app, 'return this.isBankRoute ? "BANK" : "MONEY"', 'BANK module label');
assertContains(app, 'v-if="isBankRoute" to="/uc/money"', 'Money header chip');
assertContains(app, 'p === "/exchange" || p.indexOf("/exchange/") === 0', 'desk mode preserved');
assertContains(overview, 'class="bank-glance"', 'overview glance');
assertContains(overview, 'spaces.data.length', 'space count');
assertContains(overview, 'spaces.unnamed', 'unnamed ledger cash');
assertContains(overview, 'loans.health', 'borrow health');
assertContains(overview, 'never $0 on error', 'unknown is not zero');
assertAbsent(overview, 'USD total', 'no fantasy total');

childPages.forEach(function(name) {
  var page = read('pages/intafaced/bank/' + name + '.vue');
  assertContains(page, 'class="ix-page bank-page"', name + ' Bank OS class');
  assertContains(page, '<IxState compact', name + ' compact state');
});

['overview', 'spaces', 'transfers', 'earn', 'loans', 'cards', 'ramps', 'analytics', 'business'].forEach(function(item) {
  assertContains(nav, 'intafaced.bank.nav.' + item, item + ' bank nav');
});
assertContains(cards, 'Simulated · no live issuer', 'card issuer honesty');
assertContains(ramps, 'Simulated · no live fiat rail', 'ramp honesty');
assertContains(css, '@media screen and (max-width: 640px)', '390 rules');
assertContains(css, '.bank-glance { grid-template-columns: 1fr; }', 'stacked glance tiles');
assertAbsent(overview + cards + ramps, 'Hyperswitch');
assertAbsent(overview + cards + ramps, 'wallet_rpc');

console.log('bank-os.golden: ok');
