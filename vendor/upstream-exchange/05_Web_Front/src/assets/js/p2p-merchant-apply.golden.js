'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/P2P.vue'), 'utf8');
var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || 'P2P merchant apply') + ' missing ' + needle);
}

assertContains(page, "mutate('p2p', 'merchants.submitApplication'");
assertContains(page, "mutate('p2p', 'merchants.withdraw'");
assertContains(page, "query('p2p', 'merchants.me'");
assertContains(page, "query('p2p', 'merchants.apiAccess'");
assertContains(page, '{ reason: reason }');
assertContains(page, "mutate('p2p', 'merchants.submitApplication', undefined");
if (/mutate\('p2p', 'merchants.submitApplication'[^;]*userId/.test(page)) {
  throw new Error('submitApplication must not send a userId');
}
if (/mutate\('p2p', 'merchants.withdraw'[^;]*userId/.test(page)) {
  throw new Error('withdraw must not send a userId');
}
if (page.indexOf("query('p2p', 'merchants.offerLimits'") !== -1) {
  throw new Error('must not invent offer ceilings');
}
if (page.indexOf("query('p2p', 'merchants.myOfferCeiling'") !== -1) {
  throw new Error('must not invent offer ceilings');
}
if (page.indexOf('Number(') !== -1) throw new Error('money converted to number');
if (page.indexOf('parseFloat(') !== -1) throw new Error('money converted to number');
if (page.indexOf('escrowLock') !== -1) throw new Error('shell must not call escrowLock');
if (/\bIBAN\b/i.test(page)) throw new Error('IBANs must not appear');
if (/\bSEPA\b/i.test(page) || /\bPayPal\b/i.test(page)) throw new Error('must not seed payment rails');
if (page.indexOf("reason === 'p2p.") !== -1) {
  throw new Error('named refuse must stay named via IxState, not remapped');
}
if (page.indexOf("reason === 'rejected'") !== -1) {
  throw new Error('never applied is me=null, not rejected');
}

assertContains(en, 'merchantApply:', 'en.js');
assertContains(en, 'merchantApplyLead:', 'en.js');
assertContains(en, 'merchantApplySignIn:', 'en.js');
assertContains(en, 'merchantApplyNever:', 'en.js');
assertContains(en, 'submit: "Apply"', 'en.js');
assertContains(en, 'submitDone:', 'en.js');
assertContains(en, 'withdraw: "Withdraw"', 'en.js');
assertContains(en, 'withdrawReason:', 'en.js');
assertContains(en, 'withdrawDone:', 'en.js');

console.log('p2p-merchant-apply.golden: ok');
