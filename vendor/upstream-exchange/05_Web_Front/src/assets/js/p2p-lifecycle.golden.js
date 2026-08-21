'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/P2P.vue'), 'utf8');

function assertContains(value, needle) {
  if (value.indexOf(needle) === -1) throw new Error('P2P lifecycle missing ' + needle);
}

assertContains(page, 'markFiatSent');
assertContains(page, 'confirmReceived');
assertContains(page, "mutate('p2p', procedure");
assertContains(page, 'trades.list');
assertContains(page, 'trades.cancel');
if (page.indexOf('Number(') !== -1) throw new Error('money converted to number');
if (page.indexOf('parseFloat(') !== -1) throw new Error('money converted to number');
if (/\bIBAN\b/i.test(page)) throw new Error('IBANs must not appear');
console.log('p2p-lifecycle.golden: ok');
