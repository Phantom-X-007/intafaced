#!/usr/bin/env node
/**
 * Fail-first: Merchant.vue must call mutate('pay', 'merchant.setPayoutDestination'
 * and must not ship sample IBANs.
 * Run: node src/assets/js/merchant-payout-dest.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/pay/Merchant.vue'), 'utf8');
var en = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || 'source') + ' missing ' + needle);
}

function assertAbsent(value, needle, label) {
  if (value.indexOf(needle) !== -1) throw new Error((label || 'source') + ' must not contain ' + needle);
}

assertContains(page, "mutate('pay', 'merchant.setPayoutDestination'", 'Merchant.vue');
assertContains(page, 'merchantId', 'Merchant.vue');
assertContains(page, 'railId', 'Merchant.vue');
assertContains(page, 'kind', 'Merchant.vue');
assertContains(page, 'ref', 'Merchant.vue');
assertContains(en, 'payoutDestTitle', 'en.js');
assertContains(en, 'payoutDestSave', 'en.js');
assertContains(en, 'payoutDestLead', 'en.js');

var SAMPLE_IBANS = ['GB82WEST12345698765432', 'DE89370400440532013000', 'NL91ABNA0417164300', 'FR1420041010050500013M02606'];
SAMPLE_IBANS.forEach(function (iban) {
  assertAbsent(page, iban, 'Merchant.vue');
  assertAbsent(en, iban, 'en.js');
});

console.log('merchant-payout-dest.golden: ok');
