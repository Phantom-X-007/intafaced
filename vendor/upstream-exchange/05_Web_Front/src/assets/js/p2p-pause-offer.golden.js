'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/P2P.vue'), 'utf8');
var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || 'P2P pause offer') + ' missing ' + needle);
}

assertContains(page, "mutate('p2p', 'offers.pause'");
assertContains(page, "mutate('p2p', 'offers.resume'");
assertContains(page, '{ offerId: offer.id }');
assertContains(page, 'makerId');
assertContains(page, "status === 'active'");
assertContains(page, "status === 'paused'");
if (page.indexOf('Number(') !== -1) throw new Error('money converted to number');
if (page.indexOf('parseFloat(') !== -1) throw new Error('money converted to number');
if (page.indexOf('escrowLock') !== -1) throw new Error('shell must not call escrowLock');
if (/\bIBAN\b/i.test(page)) throw new Error('IBANs must not appear');
if (/\bSEPA\b/i.test(page) || /\bPayPal\b/i.test(page)) throw new Error('must not seed payment rails');
if (page.indexOf("reason === 'p2p.") !== -1) {
  throw new Error('named refuse must stay named via IxState, not remapped');
}

assertContains(en, 'pause:', 'en.js');
assertContains(en, 'pauseDone:', 'en.js');
assertContains(en, 'resume:', 'en.js');
assertContains(en, 'resumeDone:', 'en.js');

console.log('p2p-pause-offer.golden: ok');
