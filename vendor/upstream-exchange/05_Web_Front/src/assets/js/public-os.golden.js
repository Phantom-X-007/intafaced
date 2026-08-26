'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../..');

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function has(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || 'Public OS') + ' missing ' + needle);
}

var app = read('App.vue');
var routes = read('config/routes.js');
var home = read('pages/index/Index.vue');
var en = read('assets/lang/en.js');
var css = read('assets/css/intafaced.css');

has(app, 'isMarketingRoute()', 'public shell predicate');
has(app, 'class="marketing-os-header"', 'public header');
['/exchange', '/uc/money', '/pay', '/platform'].forEach(function(route) {
  has(app, 'to="' + route + '"', 'public navigation');
});
has(routes, "{ path: '/announcement', redirect: '/notice' }", 'announcement index');
has(routes, "path: '/announcement/:id'", 'legacy announcement detail');
if (app.indexOf('/announcement/0') !== -1) throw new Error('shell still routes readers to a fabricated announcement id');

has(home, 'class="spin-wrap banner-panel marketing-hero"', 'product hero');
has(home, 'OPERATOR FINANCIAL OS', 'product eyebrow');
has(home, 'class="home-product-rail"', 'real product routes');
has(home, 'One ledger', 'ledger proposition');
has(home, 'Service-backed', 'service proposition');
has(home, 'Refuse closed', 'honesty proposition');
if (home.indexOf('bannerbg.png') !== -1) throw new Error('vendor campaign artwork still rendered');
if (home.indexOf('Beginner\'s Guide') !== -1) throw new Error('home still links to absent vendor guides');
has(en, 'Money, markets, and payments. One operating system.', 'product proposition');
has(css, '.public-page', 'public page grammar');

[
  'pages/cms/Notice.vue',
  'pages/cms/Help.vue',
  'pages/cms/HelpList.vue',
  'pages/cms/HelpDetail.vue',
  'pages/cms/NoticeItem.vue',
  'pages/cms/AboutUs.vue',
  'pages/invite/Invite.vue',
  'pages/uc/AppDownload.vue'
].forEach(function(file) { has(read(file), 'public-page', file); });

console.log('public-os.golden: ok');
