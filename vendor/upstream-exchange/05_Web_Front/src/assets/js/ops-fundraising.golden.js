'use strict';
/**
 * Fail-first: /ops fundraising card — create raise + milestone list.
 * Run from 05_Web_Front: node src/assets/js/ops-fundraising.golden.js
 *
 * Click: /ops fundraising. Records only. Empty stays empty.
 * Optional targetAmount is a decimal string with no default price.
 * Chain escrow/vesting is refused ops.fundraising_chain_unwired.
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Ops.vue'), 'utf8');
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

assert(page.indexOf("mutate('ops', 'fundraising.create'") !== -1, 'fundraising.create mutate');
assert(page.indexOf("query('ops', 'fundraising.list'") !== -1, 'fundraising.list query');
assert(page.indexOf("query('ops', 'fundraising.milestones'") !== -1, 'fundraising.milestones query');
assert(page.indexOf("intafaced.ops.fundraising.") !== -1, '$t intafaced.ops.fundraising.*');
assert(page.indexOf('ops.fundraising_chain_unwired') !== -1, 'names chain refuse');
assert(page.indexOf('IxState') !== -1, 'named refuse surface');
assert(page.indexOf("fundraisingEmpty") !== -1 || page.indexOf("intafaced.ops.fundraising.empty") !== -1, 'empty stays empty copy');

var createBlock = page.match(/addRaise\(\)\s*\{[\s\S]*?\n    \}/);
assert(Boolean(createBlock), 'addRaise present');
if (createBlock) {
  var body = createBlock[0];
  assert(/targetAmount/.test(body), 'targetAmount sent when present');
  assert(body.indexOf('Number(') === -1, 'amount not Number()');
  assert(body.indexOf('parseFloat') === -1, 'amount not parseFloat');
  assert(body.indexOf('parseInt') === -1, 'amount not parseInt');
  assert(body.indexOf('+this.raiseForm.targetAmount') === -1, 'amount not unary-plus');
  assert(!/targetAmount:\s*['"]0(\.0+)?['"]/.test(body), 'no default 0 price');
  assert(body.indexOf('valuation') === -1, 'no valuation on create');
  assert(body.indexOf('tokenPrice') === -1, 'no tokenPrice on create');
}

assert(page.indexOf('Number(') === -1, 'no Number() on this page — amounts stay strings');
assert(page.indexOf('parseFloat') === -1, 'no parseFloat on this page');
assert(!/tokenPrice|token price|valuation|mid price/i.test(page), 'no invented price on page');

assert(lang.indexOf('fundraising:') !== -1, 'en intafaced.ops.fundraising');
var copy = require('../lang/en.js').intafaced.ops.fundraising;
assert(copy && typeof copy === 'object', 'en.js intafaced.ops.fundraising object');
['title', 'lead', 'name', 'milestones', 'targetAmount', 'create', 'empty', 'milestonesEmpty', 'chainUnwired'].forEach(function (key) {
  assert(Boolean(copy[key]), 'en.js intafaced.ops.fundraising.' + key);
});
if (copy) {
  var blob = JSON.stringify(copy);
  assert(!/tokenPrice|valuation|\$0|1\.00 default/i.test(blob), 'en copy invents no price');
}

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('ops-fundraising.golden: ok');
process.exit(0);
