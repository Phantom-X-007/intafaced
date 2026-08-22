'use strict';

/**
 * Fail-first golden for pay/Settlements.vue settlement.release.
 * Run from 05_Web_Front: node src/assets/js/settlement-release.golden.js
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/pay/Settlements.vue'), 'utf8');

if (page.indexOf("mutate('pay', 'settlement.release'") === -1) {
  throw new Error('settlement.release mutate missing');
}
if (page.indexOf('settlementId') === -1) throw new Error('settlementId missing');
if (page.indexOf('reason') === -1) throw new Error('reason required');
if (page.indexOf('endpoint="/api/pay/trpc/settlement.release"') === -1) {
  throw new Error('named refuse must name settlement.release');
}
if (/Number\s*\(/.test(page)) throw new Error('no Number( — amounts stay strings');
if (page.indexOf('parseFloat') !== -1) throw new Error('no parseFloat');
if (page.indexOf('parseInt') !== -1) throw new Error('no parseInt');

console.log('settlement-release.golden: ok');
