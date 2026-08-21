#!/usr/bin/env node
/**
 * Fail-first golden for /uc/account sub-account create + revoke.
 * Run from 05_Web_Front: node src/assets/js/account-subaccounts.golden.js
 *
 * List-only is occupancy. Create/revoke must hit identity.subAccounts.create|revoke.
 * Empty list is empty copy, not "0". No ledger posts on this screen. Soft-disable only.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(
  path.join(__dirname, '../../components/uc/Account.vue'),
  'utf8'
);

if (page.indexOf("mutate('identity', 'subAccounts.create'") === -1) {
  throw new Error('mutate(identity, subAccounts.create) missing');
}
if (page.indexOf("mutate('identity', 'subAccounts.revoke'") === -1) {
  throw new Error('mutate(identity, subAccounts.revoke) missing');
}
if (page.indexOf("query('identity', 'subAccounts.list'") === -1) {
  throw new Error('query(identity, subAccounts.list) missing');
}
if (page.indexOf('subAccountId') === -1) {
  throw new Error('revoke must send subAccountId');
}
if (page.indexOf("uc.account.subAccountsEmpty") === -1) {
  throw new Error('empty list copy missing');
}
if (page.indexOf("uc.account.subAccountsCreate") === -1) {
  throw new Error('Create control missing');
}
if (page.indexOf("uc.account.subAccountsRevoke") === -1) {
  throw new Error('Revoke control missing');
}
if (page.indexOf("ledger-client") !== -1 || page.indexOf("mutate('ledger'") !== -1) {
  throw new Error('account sub-accounts must not post to the ledger');
}

console.log('account-subaccounts.golden: ok');
