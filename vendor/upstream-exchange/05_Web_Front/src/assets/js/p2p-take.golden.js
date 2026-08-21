'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/P2P.vue'), 'utf8');

function assertContains(value, needle) {
  if (value.indexOf(needle) === -1) throw new Error('P2P take missing ' + needle);
}

assertContains(page, "mutate('p2p', 'trades.take'");
assertContains(page, 'offerId');
assertContains(page, 'amount');
assertContains(page, 'method');
if (page.indexOf('Number(') !== -1) throw new Error('money converted to number');
if (page.indexOf('parseFloat(') !== -1) throw new Error('money converted to number');
if (page.indexOf('escrowLock') !== -1) throw new Error('shell must not call escrowLock');
if (/\bIBAN\b/i.test(page)) throw new Error('IBANs must not appear');
if (/\bSEPA\b/i.test(page) || /\bPayPal\b/i.test(page)) throw new Error('must not seed payment rails');
console.log('p2p-take.golden: ok');
