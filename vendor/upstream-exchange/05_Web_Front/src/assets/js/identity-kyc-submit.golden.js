#!/usr/bin/env node
/**
 * Honesty lock for Index.vue identity.kyc.submit.
 * Run from 05_Web_Front: node src/assets/js/identity-kyc-submit.golden.js
 *
 * Fail-first: mutate('identity', 'kyc.submit'
 * Submit grants nothing. No userId, no providerRef, no document upload.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/index/Index.vue'), 'utf8');
var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

var failed = 0;
function assert(cond, name) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

assert(
  page.indexOf("mutate('identity', 'kyc.submit'") !== -1,
  'kyc.submit mutate present'
);
assert(
  page.indexOf("query('identity', 'kyc.status'") !== -1,
  'kyc.status query present'
);
assert(
  page.indexOf('endpoint="/api/identity/trpc/kyc.submit"') !== -1,
  'kyc.submit IxState names the refuse'
);

var submitBlock = page.match(/submitKyc\(\)\s*\{[\s\S]*?\n    \}/);
assert(Boolean(submitBlock), 'submitKyc present');
if (submitBlock) {
  var body = submitBlock[0];
  assert(body.indexOf("mutate('identity', 'kyc.submit'") !== -1, 'submitKyc calls kyc.submit');
  assert(body.indexOf('userId') === -1, 'no userId field');
  assert(body.indexOf('providerRef') === -1, 'no providerRef');
  assert(/tier:\s*this\.kycTier/.test(body), 'tier from picker');
  assert(/jurisdiction:\s*this\.kycJurisdiction\.toUpperCase\(\)/.test(body), 'jurisdiction uppercased');
}

assert(page.indexOf('value="basic"') !== -1, 'tier basic');
assert(page.indexOf('value="full"') !== -1, 'tier full');
assert(page.indexOf('value="institutional"') !== -1, 'tier institutional');
assert(page.indexOf('type="file"') === -1, 'no document upload');
assert(page.indexOf('providerRef') === -1, 'no providerRef on Index');
assert(page.indexOf('intafaced.kyc.submitPending') !== -1, 'pending row copy');
assert(page.indexOf("r.status === \"pending\"") !== -1, 'pending rows from kyc.status');

assert(en.indexOf('submitTitle:') !== -1, 'en.js submitTitle');
assert(en.indexOf('submitLead:') !== -1, 'en.js submitLead');
assert(en.indexOf('submitPending:') !== -1, 'en.js submitPending');
assert(en.indexOf('tierBasic:') !== -1, 'en.js tierBasic');
assert(en.indexOf('tierFull:') !== -1, 'en.js tierFull');
assert(en.indexOf('tierInstitutional:') !== -1, 'en.js tierInstitutional');
assert(en.indexOf('jurisdictionHint:') !== -1, 'en.js jurisdictionHint');
assert(en.indexOf('It grants nothing') !== -1, 'submit grants nothing');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('identity-kyc-submit.golden: ok');
process.exit(0);
