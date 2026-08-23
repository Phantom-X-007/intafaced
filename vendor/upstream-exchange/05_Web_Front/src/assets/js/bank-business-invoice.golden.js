'use strict';
/**
 * Fail-first: /bank/business invoice reuses merchant.createLink; token once.
 * Run from 05_Web_Front: node src/assets/js/bank-business-invoice.golden.js
 *
 * No second book. Amount stays a string. No assembled checkout origin.
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

assert(page.indexOf("'merchant.createLink'") !== -1, 'createLink mutate');
assert(page.indexOf("'merchant.me'") !== -1, 'merchant.me query');
assert(page.indexOf('issuedInvoice.data.token') !== -1, 'token shown once');
assert(page.indexOf('https://') === -1, 'no assembled checkout origin');
assert(page.indexOf('Number(') === -1, 'no Number() on Business.vue');
assert(page.indexOf('parseFloat') === -1, 'no parseFloat on Business.vue');
assert(page.indexOf('parseInt') === -1, 'no parseInt on Business.vue');
assert(page.indexOf('socket.psp-partners') !== -1 || lang.indexOf('socket.psp-partners') !== -1, 'names card-acquiring socket');

assert(lang.indexOf('invoiceTitle:') !== -1, 'en.js invoiceTitle');
var copy = require('../lang/en.js').intafaced.bank.business;
assert(copy.invoiceLead.indexOf('pay.gateway') !== -1, 'lead names pay.gateway');
assert(copy.invoiceSocket.indexOf('socket.psp-partners') !== -1, 'copy names psp socket');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('bank-business-invoice.golden: ok');
process.exit(0);
