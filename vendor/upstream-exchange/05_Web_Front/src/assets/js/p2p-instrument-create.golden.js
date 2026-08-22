'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/P2P.vue'), 'utf8');
var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || 'P2P save instrument') + ' missing ' + needle);
}

assertContains(page, "mutate('p2p', 'instruments.create'");
assertContains(page, "mutate('p2p', 'instruments.remove'");
assertContains(page, "query('p2p', 'instruments.list'");
assertContains(page, "query('p2p', 'instruments.methods.list'");
assertContains(page, '{ instrumentId: row.id }');
assertContains(page, 'instrumentDetailsPayload');
assertContains(page, 'instrumentDetailFields');
if (page.indexOf('if (label) input.label = label;') === -1) {
  throw new Error('blank label must be omitted, not sent empty');
}
if (page.indexOf('Number(') !== -1) throw new Error('money converted to number');
if (page.indexOf('parseFloat(') !== -1) throw new Error('money converted to number');
if (page.indexOf('escrowLock') !== -1) throw new Error('shell must not call escrowLock');
if (/\bIBAN\b/i.test(page)) throw new Error('IBANs must not appear');
if (/\bSEPA\b/i.test(page) || /\bPayPal\b/i.test(page)) throw new Error('must not seed payment rails');
if (page.indexOf("reason === 'p2p.") !== -1) {
  throw new Error('named refuse must stay named via IxState, not remapped');
}
if (page.indexOf('row.details') !== -1 || page.indexOf('instrumentSave.data.details') !== -1) {
  throw new Error('list and save result must stay headers only');
}
if (page.indexOf("mutate('p2p', 'instruments.reveal'") !== -1) {
  throw new Error('reveal is optional and not part of this journey');
}

assertContains(en, 'instrument:', 'en.js');
assertContains(en, 'instrumentLead:', 'en.js');
assertContains(en, 'instrumentMethod:', 'en.js');
assertContains(en, 'instrumentCountry:', 'en.js');
assertContains(en, 'instrumentFiat:', 'en.js');
assertContains(en, 'instrumentSignIn:', 'en.js');
assertContains(en, 'instrumentDone:', 'en.js');
assertContains(en, 'create: "Save instrument"', 'en.js');
assertContains(en, 'remove: "Remove"', 'en.js');
assertContains(en, 'removeDone:', 'en.js');

console.log('p2p-instrument-create.golden: ok');
