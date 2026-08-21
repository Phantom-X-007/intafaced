#!/usr/bin/env node
/**
 * Fail-first: /bank/transfers wires transfers.toUser with a decimal-string amount.
 * Run from 05_Web_Front: node src/assets/js/bank-transfer-to-user.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/bank/Transfers.vue'), 'utf8');

if (page.indexOf("mutate('bank', 'transfers.toUser'") === -1) {
  throw new Error("fail-first: Transfers.vue must contain mutate('bank', 'transfers.toUser'");
}

var mutateIdx = page.indexOf("mutate('bank', 'transfers.toUser'");
var mutateChunk = page.slice(mutateIdx, mutateIdx + 420);
if (mutateChunk.indexOf('amount: this.toUser.amount') === -1) {
  throw new Error('amount must be the form string (this.toUser.amount)');
}
if (/amount:\s*(Number|parseFloat|parseInt)\s*\(/.test(mutateChunk)) {
  throw new Error('amount must stay a decimal string — no Number/parseFloat on the amount field');
}
if (/Number\s*\(\s*(this\.)?toUser\.amount/.test(page) || /parseFloat\s*\(\s*(this\.)?toUser\.amount/.test(page)) {
  throw new Error('amount must stay a decimal string — no Number/parseFloat on toUser.amount');
}
if (page.indexOf("intafaced.bank.transfersPage.needSpace") === -1) {
  throw new Error('empty spaces must use existing need-space copy, not 0');
}
if (page.indexOf("draftId('toUser')") === -1) {
  throw new Error('transferId must come from existing draftId');
}

console.log('bank-transfer-to-user.golden: ok');
