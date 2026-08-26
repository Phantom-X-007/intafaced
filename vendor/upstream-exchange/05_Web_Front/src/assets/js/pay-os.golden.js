#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function contains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || needle) + ' missing');
}
function absent(value, needle, label) {
  if (value.indexOf(needle) !== -1) throw new Error((label || needle) + ' must be absent');
}

var app = read('App.vue');
var overview = read('pages/intafaced/Pay.vue');
var nav = read('config/ix-nav.js');
var css = read('assets/css/intafaced.css');
var pages = ['Money', 'Merchant', 'Network', 'Permissions', 'Links', 'Payments', 'Settlements', 'Checkout'];

contains(app, 'p === "/pay" || p.indexOf("/pay/") === 0', 'Pay OS route matcher');
contains(app, 'return this.isPayRoute ? "PAY" : "MONEY"', 'PAY module label');
contains(app, 'v-if="isPayRoute" to="/bank"', 'Bank header chip');
contains(app, 'to="/uc/money" class="money-os-chip">Money', 'Money header chip');
contains(app, 'p === "/exchange" || p.indexOf("/exchange/") === 0', 'desk mode preserved');
contains(overview, 'class="bank-glance pay-glance"', 'three-tile glance');
contains(overview, "query('pay', 'health'", 'service health');
contains(overview, "query('pay', 'railHealth'", 'rail readiness');
contains(overview, "query('pay', 'merchant.me'", 'merchant identity');
contains(overview, 'No live acquirer implied', 'acquirer honesty');
contains(overview, 'never converted to a zero balance', 'failed read honesty');
contains(overview, '<details class="bank-advanced">', 'advanced review disclosure');

pages.forEach(function(name) {
  var page = read('pages/intafaced/pay/' + name + '.vue');
  contains(page, 'class="ix-page bank-page pay-page"', name + ' Pay OS class');
  contains(page, '<IxState compact', name + ' compact state');
});

['overview', 'money', 'merchant', 'network', 'permissions', 'links', 'payments', 'settlements', 'checkout'].forEach(function(item) {
  contains(nav, 'intafaced.pay.nav.' + item, item + ' pay nav');
});
contains(css, '@media screen and (max-width: 640px)', 'compact viewport rules');
absent(overview, 'Number(');
absent(overview, 'parseFloat');
absent(overview, 'wallet_rpc');

console.log('pay-os.golden: ok');
