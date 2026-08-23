'use strict';
/**
 * Fail-first: /bank/business expense cards reuse cards.issue; simulated is visible.
 * Run from 05_Web_Front: node src/assets/js/bank-expense-cards.golden.js
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/bank/Business.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

var failed = 0;
function assert(cond, name) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

assert(page.indexOf("'cards.issue'") !== -1, 'cards.issue mutate');
assert(page.indexOf('perAuthorizationLimit: this.expenseForm.perAuthorizationLimit') !== -1, 'limit is a string field');
assert(page.indexOf('issuedCard.data.simulated') !== -1, 'simulated drawn on success');
assert(page.indexOf('Number(') === -1, 'no Number() on Business.vue');
assert(page.indexOf('parseFloat') === -1, 'no parseFloat on Business.vue');
assert(!/4242|4111/.test(page), 'no invented PAN');

assert(lang.indexOf('expenseTitle:') !== -1, 'en.js expenseTitle');
assert(lang.indexOf('expenseSimulated:') !== -1, 'en.js expenseSimulated');
var copy = require('../lang/en.js').intafaced.bank.business;
assert(copy.expenseLead.indexOf('bank.cards') !== -1, 'lead names bank.cards');
assert(!/4242|4111/.test(JSON.stringify(copy)), 'copy invents no PAN');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('bank-expense-cards.golden: ok');
process.exit(0);
