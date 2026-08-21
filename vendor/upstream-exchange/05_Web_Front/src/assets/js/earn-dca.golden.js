#!/usr/bin/env node
/**
 * Honesty lock for bank/Earn.vue DCA auto-invest.
 * Run from 05_Web_Front: node src/assets/js/earn-dca.golden.js
 *
 * Fail-first: the page must call autoInvest.createDca. Amount stays a decimal
 * string. Cadence is daily|weekly|monthly. startsAt is an ISO datetime. A
 * missing convert counterparty surfaces bank.auto_invest_rate_unset — this
 * screen does not invent a rate. An empty rule list stays empty copy.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(
  path.join(__dirname, '../../pages/intafaced/bank/Earn.vue'),
  'utf8'
);

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
  page.indexOf("mutate('bank', 'autoInvest.createDca'") !== -1,
  'createDca mutate present'
);
assert(
  page.indexOf("query('bank', 'autoInvest.list'") !== -1,
  'autoInvest.list query present'
);

var createBlock = page.match(/submitDca\(\)\s*\{[\s\S]*?\n    \}/);
assert(Boolean(createBlock), 'submitDca present');
if (createBlock) {
  var body = createBlock[0];
  assert(/amount:\s*this\.dcaForm\.amount/.test(body), 'amount as string');
  assert(/cadence:\s*this\.dcaForm\.cadence/.test(body), 'cadence as string enum');
  assert(/startsAt:\s*startsAt/.test(body), 'startsAt ISO datetime sent');
  assert(body.indexOf('Number(') === -1, 'amount not Number()');
  assert(body.indexOf('parseFloat') === -1, 'amount not parseFloat');
  assert(body.indexOf('parseInt') === -1, 'amount not parseInt');
  assert(body.indexOf('+this.dcaForm.amount') === -1, 'amount not unary-plus');
}

assert(page.indexOf("bank.auto_invest_rate_unset") !== -1, 'names bank.auto_invest_rate_unset');
assert(page.indexOf("value=\"daily\"") !== -1, 'cadence daily');
assert(page.indexOf("value=\"weekly\"") !== -1, 'cadence weekly');
assert(page.indexOf("value=\"monthly\"") !== -1, 'cadence monthly');
assert(
  page.indexOf('intafaced.bank.earnPage.dcaEmpty') !== -1,
  'empty list of rules stays empty copy'
);
assert(page.indexOf('Number(') === -1, 'no Number( on this page — amounts stay strings');
assert(page.indexOf('parseFloat') === -1, 'no parseFloat on this page');
assert(page.indexOf('parseInt') === -1, 'no parseInt on this page');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('earn-dca.golden: ok');
process.exit(0);
