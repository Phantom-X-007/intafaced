'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../..');
var app = fs.readFileSync(path.join(root, 'App.vue'), 'utf8');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/P2P.vue'), 'utf8');
var market = fs.readFileSync(path.join(root, 'pages/otc/Main.vue'), 'utf8');
var routes = fs.readFileSync(path.join(root, 'config/routes.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'assets/css/intafaced.css'), 'utf8');

function has(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || 'P2P OS') + ' missing ' + needle);
}

has(app, 'isP2PRoute()', 'shell');
has(app, 'if (this.isP2PRoute) return "P2P"', 'shell label');
has(app, 'p === "/p2p" || p === "/otc"', 'shared shell route');
has(page, 'class="ix-page bank-page p2p-page"', 'operations shell');
has(page, 'class="p2p-jump-nav"', 'operations navigation');
['p2p-offers', 'p2p-trades', 'p2p-create', 'p2p-instruments', 'p2p-merchant', 'p2p-fiat'].forEach(function(id) {
  has(page, 'id="' + id + '"', 'operations section');
  has(css, '.p2p-page > #' + id, 'operations priority');
});
has(page, '<IxState compact', 'compact refusal state');
has(market, 'class="ix-page bank-page otc-page"', 'market shell');
has(market, 'class="ix-page-head"', 'market page header');
has(market, 'class="p2p-jump-nav"', 'market workspace navigation');
has(market, 'to="/p2p">Operations', 'market operations link');
has(market, '<IxState compact', 'market refusal state');
has(market, '<details class="otc-market-notes bank-details">', 'market disclosure');
has(css, '@media (max-width: 700px)', 'responsive contract');
has(routes, "{ path: '/ctc', redirect: '/p2p' }", 'legacy C2C one-hop route');

[page, market].forEach(function(source) {
  if (source.indexOf('Number(') !== -1) throw new Error('money converted to number');
  if (source.indexOf('parseFloat(') !== -1) throw new Error('money converted to number');
});

console.log('p2p-os.golden: ok');
