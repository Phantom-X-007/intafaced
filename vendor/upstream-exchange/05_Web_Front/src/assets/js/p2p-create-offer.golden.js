'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/P2P.vue'), 'utf8');
var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || 'P2P create offer') + ' missing ' + needle);
}

assertContains(page, "mutate('p2p', 'offers.create'");
assertContains(page, 'fiatCurrency');
assertContains(page, 'priceType');
assertContains(page, 'minAmount');
assertContains(page, 'maxAmount');
assertContains(page, 'methods: methods');
if (page.indexOf('if (totalAmount) input.totalAmount = totalAmount;') === -1) {
  throw new Error('blank totalAmount must be omitted, not sent empty');
}
if (page.indexOf('if (terms) input.terms = terms;') === -1) {
  throw new Error('blank terms must be omitted, not sent empty');
}
if (page.indexOf('Number(') !== -1) throw new Error('money converted to number');
if (page.indexOf('parseFloat(') !== -1) throw new Error('money converted to number');
if (page.indexOf('escrowLock') !== -1) throw new Error('shell must not call escrowLock');
if (/\bIBAN\b/i.test(page)) throw new Error('IBANs must not appear');
if (/\bSEPA\b/i.test(page) || /\bPayPal\b/i.test(page)) throw new Error('must not seed payment rails');
if (page.indexOf("reason === 'p2p.") !== -1) {
  throw new Error('named refuse must stay named via IxState, not remapped');
}

assertContains(en, 'createOffer:', 'en.js');
assertContains(en, 'createOfferLead:', 'en.js');
assertContains(en, 'createOfferAsset:', 'en.js');
assertContains(en, 'createOfferFiat:', 'en.js');
assertContains(en, 'createOfferPriceType:', 'en.js');
assertContains(en, 'createOfferMin:', 'en.js');
assertContains(en, 'createOfferMax:', 'en.js');
assertContains(en, 'createOfferMethods:', 'en.js');
assertContains(en, 'createOfferSubmit:', 'en.js');
assertContains(en, 'createOfferSignIn:', 'en.js');
assertContains(en, 'createOfferDone:', 'en.js');

console.log('p2p-create-offer.golden: ok');
