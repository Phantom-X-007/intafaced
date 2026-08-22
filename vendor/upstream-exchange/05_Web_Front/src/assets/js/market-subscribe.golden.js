'use strict';
/**
 * Fail-first pin: /market Subscribe clicks mutate('market', 'subscribe'
 * at /api/market/trpc/subscribe. Named refuse only — no second money book.
 * Run from 05_Web_Front: node src/assets/js/market-subscribe.golden.js
 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/Market.vue'), 'utf8');
var lang = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

if (page.indexOf("mutate('market', 'subscribe'") === -1) throw new Error('subscribe mutate missing');
if (page.indexOf('/api/market/trpc/subscribe') === -1) throw new Error('subscribe endpoint missing');
if (page.indexOf("intafaced.market.empty") === -1) throw new Error('empty listings must stay empty');
if (page.indexOf("offerType: 'subscription'") !== -1) throw new Error('do not invent offerType subscription on catalogue');
if (page.indexOf('Number(') !== -1) throw new Error('money converted to number');
if (page.indexOf('parseFloat') !== -1) throw new Error('parseFloat on market page');
if (page.indexOf('parseInt') !== -1) throw new Error('parseInt on market page');
if (page.indexOf('type="number"') !== -1) throw new Error('number input on market page');
if (page.indexOf('fetch(') !== -1) throw new Error('raw fetch on market page');
if (lang.indexOf('subscribe: "Subscribe"') === -1) throw new Error('intafaced.market.subscribe missing');
console.log('market-subscribe.golden: ok');
