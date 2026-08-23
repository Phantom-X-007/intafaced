#!/usr/bin/env node
/**
 * Honesty lock for bank/Earn.vue auto-invest RUN.
 * Run from 05_Web_Front: node src/assets/js/earn-autoi-run.golden.js
 *
 * Fail-first: the page must call ops.runAutoInvest. Convert success prints
 * runner counts; a missing convert counterparty names
 * bank.auto_invest_rate_unset. This screen does not invent a rate. Amounts
 * stay decimal strings. Deleting the run mutate must fail this file.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/bank/Earn.vue'), 'utf8');
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
  page.indexOf("mutate('bank', 'ops.runAutoInvest'") !== -1,
  'ops.runAutoInvest mutate present'
);
assert(
  page.indexOf("endpoint=\"/api/bank/trpc/ops.runAutoInvest\"") !== -1,
  'ops.runAutoInvest IxState endpoint'
);
assert(page.indexOf('runAutoInvest()') !== -1, 'runAutoInvest click present');
assert(page.indexOf("bank.auto_invest_rate_unset") !== -1, 'names bank.auto_invest_rate_unset');
assert(
  page.indexOf('intafaced.bank.earnPage.dcaRateUnset') !== -1,
  'rate-unset copy on the page'
);
assert(
  page.indexOf('intafaced.bank.earnPage.dcaRun') !== -1,
  'run i18n on the page'
);
assert(page.indexOf('dcaRun.data.settled') !== -1, 'convert success shows settled count');
assert(page.indexOf('f.code') !== -1, 'named refuse codes from failures stay named');
assert(page.indexOf('Number(') === -1, 'no Number( on this page — amounts stay strings');
assert(page.indexOf('parseFloat') === -1, 'no parseFloat on this page');
assert(page.indexOf('parseInt') === -1, 'no parseInt on this page');
assert(page.indexOf('avgPrice') === -1, 'page does not invent a convert mid');
assert(page.indexOf('invent') !== -1, 'copy says this screen does not invent a rate');

var runBlock = page.match(/runAutoInvest\(\)\s*\{[\s\S]*?\n    \}/);
assert(Boolean(runBlock), 'runAutoInvest method present');
if (runBlock) {
  var body = runBlock[0];
  assert(body.indexOf("mutate('bank', 'ops.runAutoInvest'") !== -1, 'method calls ops.runAutoInvest');
  assert(body.indexOf('Number(') === -1, 'run mutate not Number()');
  assert(body.indexOf('parseFloat') === -1, 'run mutate not parseFloat');
}

assert(en.indexOf('dcaRun:') !== -1, 'en.js dcaRun');
assert(en.indexOf('dcaRunLead:') !== -1, 'en.js dcaRunLead');
assert(en.indexOf('dcaRunDone:') !== -1, 'en.js dcaRunDone');
assert(en.indexOf('bank.auto_invest_rate_unset') !== -1, 'en.js names bank.auto_invest_rate_unset');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('earn-autoi-run.golden: ok');
process.exit(0);
