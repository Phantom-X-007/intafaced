#!/usr/bin/env node
/**
 * Golden lock for bank/Loans.vue amount honesty.
 * Run: node src/assets/js/bank-loans-honesty.golden.js
 *
 * Fail-first: this file names the existing mutates and refuses Number(amount).
 * Red until Loans.vue keeps those mutates and sends amounts as strings.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/bank/Loans.vue'), 'utf8');

function assertContains(needle, msg) {
  if (page.indexOf(needle) === -1) throw new Error(msg || 'missing ' + needle);
}

assertContains('mutate(', 'mutate helper missing');
assertContains("'loans.open'", 'loans.open mutate missing');
assertContains("'loans.addCollateral'", 'loans.addCollateral mutate missing');
assertContains("'loans.repay'", 'loans.repay mutate missing');
assertContains("'loans.close'", 'loans.close mutate missing');

if (page.indexOf('Number(amount') !== -1) {
  throw new Error('Number(amount) — amounts must stay strings');
}
if (/Number\s*\(\s*(this\.)?(openForm\.)?(collateralAmount|repayAmount|principal)\b/.test(page)) {
  throw new Error('Number( on amount field — amounts must stay strings');
}

assertContains("collateralAmount: this.openForm.collateralAmount", 'open collateralAmount is not the string field');
assertContains('principal: this.openForm.principal', 'open principal is not the string field');
assertContains('amount: this.collateralAmount', 'addCollateral amount is not the string field');
assertContains('amount: this.repayAmount', 'repay amount is not the string field');

assertContains("self.collateralAmount = ''", 'collateral empty reset missing');
assertContains("self.repayAmount = ''", 'repay empty reset missing');
assertContains("collateralAmount: '', principal: ''", 'openForm empty reset missing');

console.log('bank-loans-honesty.golden: ok');
