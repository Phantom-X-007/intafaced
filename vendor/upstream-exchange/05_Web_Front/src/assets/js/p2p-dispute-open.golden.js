'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/P2P.vue'), 'utf8');
var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || 'P2P open dispute') + ' missing ' + needle);
}

assertContains(page, "mutate('p2p', 'disputes.open'");
assertContains(page, "mutate('p2p', 'disputes.appendEvidence'");
assertContains(page, "query('p2p', 'disputes.get'");
assertContains(page, 'tradeId: trade.id');
assertContains(page, 'reason: reason');
assertContains(page, 'if (evidence.length) input.evidence = evidence;');
assertContains(page, '{ tradeId: trade.id, evidence: evidence }');
assertContains(page, 'ifNobodyRules');
assertContains(page, 'moderationReachable');
assertContains(page, 'disputeOpen.data.chatThreadId');
assertContains(page, "intafaced.p2p.disputeChatThread");
assertContains(page, "status === 'escrowed'");
assertContains(page, "status === 'fiat_sent'");
assertContains(page, "status === 'disputed'");
if (page.indexOf('Number(') !== -1) throw new Error('money converted to number');
if (page.indexOf('parseFloat(') !== -1) throw new Error('money converted to number');
if (page.indexOf('escrowLock') !== -1) throw new Error('shell must not call escrowLock');
if (/\bIBAN\b/i.test(page)) throw new Error('IBANs must not appear');
if (page.indexOf("reason === 'p2p.") !== -1) {
  throw new Error('named refuse must stay named via IxState, not remapped');
}
if (page.indexOf("mutate('p2p', 'disputes.resolve'") !== -1) {
  throw new Error('must not invent a moderator resolve');
}
if (page.indexOf("query('p2p', 'disputes.list'") !== -1) {
  throw new Error('must not mount the moderator queue on this party screen');
}
if (/watching console|moderator is watching|a console is watching/i.test(page)) {
  throw new Error('must not fake a watching console');
}
if (page.indexOf('LiveKit') !== -1) {
  throw new Error('must not invent a LiveKit room');
}
if (/fake transcript|lorem ipsum/i.test(page)) {
  throw new Error('must not invent a fake chat');
}
if (/evidenceRemove|removeEvidence|editEvidence|evidenceEdit/.test(page)) {
  throw new Error('evidence is append-only — no edit/remove UI');
}

assertContains(en, 'disputeReason:', 'en.js');
assertContains(en, 'disputeEvidence:', 'en.js');
assertContains(en, 'disputeDeadline:', 'en.js');
assertContains(en, 'disputeIfNobodyRules:', 'en.js');
assertContains(en, 'disputeModerationReachable:', 'en.js');
assertContains(en, 'disputeChatThread:', 'en.js');
assertContains(en, 'open: "Open dispute"', 'en.js');
assertContains(en, 'openDone:', 'en.js');
assertContains(en, 'append: "Append evidence"', 'en.js');
assertContains(en, 'appendDone:', 'en.js');

console.log('p2p-dispute-open.golden: ok');
