'use strict';

/**
 * Golden for pay/Settlements.vue — refused/unloaded health is not zero rails.
 * Run from 05_Web_Front:  node src/assets/js/pay-settlements-honesty.golden.js
 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/pay/Settlements.vue'), 'utf8');

if (page.indexOf('settlement.payout') === -1) throw new Error('settlement.payout missing');
if (page.indexOf("mutate(") === -1) throw new Error('settlement.payout mutate missing');
if (page.indexOf("'settlement.payout'") === -1) throw new Error('settlement.payout mutate name missing');

if (page.indexOf("query('pay', 'health'") === -1) throw new Error('health query missing');
if (page.indexOf(':reason="health.reason"') === -1) throw new Error('health must be passed to IxState');
if (page.indexOf(':loading="health.loading"') === -1) throw new Error('health loading must be passed to IxState');

var rail = page.match(/railIds\(\)\s*\{[\s\S]*?\n    \},/);
if (!rail) throw new Error('railIds computed missing');
if (
  rail[0].indexOf("health.reason === 'ok'") === -1 &&
  rail[0].indexOf('health.reason === "ok"') === -1 &&
  rail[0].indexOf("health.reason !== 'ok'") === -1 &&
  rail[0].indexOf('health.reason !== "ok"') === -1
) {
  throw new Error('railIds unused unless health.reason===ok');
}

if (page.indexOf('{{ current.gross }}') === -1) throw new Error('gross must stay the service string');
if (page.indexOf('{{ current.fees }}') === -1) throw new Error('fees must stay the service string');
if (page.indexOf('{{ current.net }}') === -1) throw new Error('net must stay the service string');
if (/Number\s*\(/.test(page)) throw new Error('no Number( on this page — amounts stay strings');
if (/amount\s*:\s*Number\s*\(/.test(page)) throw new Error('no Number( on amount)');

console.log('pay-settlements-honesty.golden: ok');
