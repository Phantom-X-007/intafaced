'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/pay/Money.vue'), 'utf8');

if (page.indexOf("query('pay', 'health'") === -1) throw new Error('health query missing');
if (page.indexOf(':reason="health.reason"') === -1) throw new Error('health must be passed to IxState');
if (page.indexOf(':loading="health.loading"') === -1) throw new Error('health loading must be passed to IxState');

var needle = 'noRailToUse';
var from = 0;
var hits = 0;
while (true) {
  var i = page.indexOf(needle, from);
  if (i === -1) break;
  hits += 1;
  var around = page.slice(Math.max(0, i - 500), i);
  if (around.indexOf("health.reason === 'ok'") === -1 && around.indexOf('health.reason === "ok"') === -1) {
    throw new Error('noRailToUse only when health.reason===ok');
  }
  from = i + needle.length;
}
if (hits === 0) throw new Error('noRailToUse copy missing');

if (page.indexOf('withdrawal.create') === -1) throw new Error('withdrawal.create missing');
if (page.indexOf('mutate(') === -1) throw new Error('withdrawal.create mutate missing');
if (page.indexOf('amount: this.form.amount') === -1) throw new Error('withdrawal.create amount must stay a string');
if (/amount\s*:\s*Number\s*\(/.test(page) || /Number\s*\(\s*(this\.)?form\.amount/.test(page)) {
  throw new Error('no Number( on amount)');
}

console.log('pay-money-honesty.golden: ok');
