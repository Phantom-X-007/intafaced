#!/usr/bin/env node
/**
 * Honesty lock for bank/Cards.vue card round-up.
 * Run from 05_Web_Front: node src/assets/js/card-roundup.golden.js
 *
 * Fail-first: the page must call autoInvest.createRoundUp. Granularity stays a
 * decimal string. Cross-asset buyAssetId surfaces bank.auto_invest_rate_unset
 * and is not sent — this screen does not invent a convert rate. An empty rule
 * list stays empty copy, not a zeroed table.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(
  path.join(__dirname, '../../pages/intafaced/bank/Cards.vue'),
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
  page.indexOf("mutate('bank', 'autoInvest.createRoundUp'") !== -1,
  'createRoundUp mutate present'
);
assert(
  page.indexOf("query('bank', 'autoInvest.list'") !== -1,
  'autoInvest.list query present'
);

var createBlock = page.match(/submitRoundUp\(\)\s*\{[\s\S]*?\n    \}/);
assert(Boolean(createBlock), 'submitRoundUp present');
if (createBlock) {
  var body = createBlock[0];
  assert(/granularity:\s*this\.roundUpForm\.granularity/.test(body), 'granularity as string');
  assert(body.indexOf('Number(') === -1, 'granularity not Number()');
  assert(body.indexOf('parseFloat') === -1, 'granularity not parseFloat');
  assert(body.indexOf('parseInt') === -1, 'granularity not parseInt');
  assert(body.indexOf('+this.roundUpForm.granularity') === -1, 'granularity not unary-plus');
  assert(body.indexOf("bank.auto_invest_rate_unset") !== -1, 'cross-asset names bank.auto_invest_rate_unset');
  assert(/buy\s*&&\s*buy\s*!==\s*assetId/.test(body), 'cross-asset buyAssetId is not sent');
  assert(/if\s*\(buy\)\s*input\.buyAssetId\s*=\s*buy/.test(body), 'buyAssetId omitted unless same-asset');
}

assert(
  page.indexOf('intafaced.bank.cardsPage.roundUpEmpty') !== -1,
  'empty list of rules stays empty copy'
);
assert(page.indexOf('Number(') === -1, 'no Number( on this page — amounts stay strings');
assert(page.indexOf('parseFloat') === -1, 'no parseFloat on this page');
assert(page.indexOf('parseInt') === -1, 'no parseInt on this page');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('card-roundup.golden: ok');
process.exit(0);
