#!/usr/bin/env node
/**
 * Fail-first: /bank/business wires dual-control create / propose / approve.
 * Amounts stay decimal strings. Empty list ≠ 0. Maker self-approve is named
 * by the existing backend code, not a new taxonomy.
 *
 * Run from 05_Web_Front: node src/assets/js/bank-business.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || 'bank-business') + ' missing ' + needle);
}

function assertAbsent(value, needle, label) {
  if (value.indexOf(needle) !== -1) throw new Error((label || 'bank-business') + ' must not contain ' + needle);
}

var page = fs.readFileSync(path.join(root, 'pages/intafaced/bank/Business.vue'), 'utf8');

assertContains(page, "mutate('bank', 'business.create'");
assertContains(page, "mutate('bank', 'business.proposeTransfer'");
assertContains(page, "mutate('bank', 'business.approve'");
assertContains(page, "mutate('bank', 'business.runPayroll'");
assertContains(page, "query('bank', 'business.list'");
assertContains(page, "query('bank', 'business.pending'");
assertContains(page, '@click="submitPayroll"');
assertContains(page, 'bank.business_payroll_rate_unset');
assertContains(page, "draftId('payroll')");

assertContains(page, 'spendThreshold: this.createForm.spendThreshold');
assertContains(page, 'amount: this.propose.amount');
assertContains(page, "kind === 'pending'");
assertContains(page, 'bank.business_self_approve');
assertContains(page, 'accounts.data && accounts.data.length');
assertContains(page, 'intafaced.bank.business.noAccounts');
assertContains(page, 'endpoint="/api/bank/trpc/business.approve"');

assertAbsent(page, 'Number(', 'Business.vue');
assertAbsent(page, 'parseFloat', 'Business.vue');
assertAbsent(page, 'parseInt', 'Business.vue');
if (/amount:\s*(Number|parseFloat|parseInt)\s*\(/.test(page)) {
  throw new Error('amount must stay a decimal string');
}

var routes = fs.readFileSync(path.join(root, 'config/routes.js'), 'utf8');
assertContains(routes, "path: '/bank/business'", 'routes.js');
assertContains(routes, 'pages/intafaced/bank/Business', 'routes.js');

var nav = fs.readFileSync(path.join(root, 'config/ix-nav.js'), 'utf8');
assertContains(nav, "to: '/bank/business'", 'ix-nav.js');

var lang = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');
assertContains(lang, 'noAccounts:', 'en.js');
assertContains(lang, 'selfApprove:', 'en.js');
assertContains(lang, 'payroll:', 'en.js');
assertContains(lang, 'payrollRateUnset:', 'en.js');

console.log('bank-business.golden: ok');
