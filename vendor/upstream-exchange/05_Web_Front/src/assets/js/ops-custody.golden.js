'use strict';
/**
 * Fail-first: /ops custody card — cold/warm/hot tiers + approval list.
 * Run from 05_Web_Front: node src/assets/js/ops-custody.golden.js
 *
 * Click: /ops custody empty keys empty
 * Unset wrap fail-closed as ops.custody_wrap_unset.
 * No real keys. On-chain multi-sig is not this card.
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Ops.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');
var routes = fs.readFileSync(path.join(__dirname, '../../config/routes.js'), 'utf8');

var failed = 0;
function assert(cond, name) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

assert(page.indexOf("query('ops', 'custody.list'") !== -1, 'custody.list query');
assert(page.indexOf("mutate('ops', 'custody.createApproval'") !== -1, 'custody.createApproval mutate');
assert(page.indexOf("mutate('ops', 'custody.execute'") !== -1, 'custody.execute mutate');
assert(page.indexOf("intafaced.ops.custody.") !== -1, '$t intafaced.ops.custody.*');
assert(page.indexOf('ops.custody_wrap_unset') !== -1, 'names wrap refuse');
assert(page.indexOf('ops.custody_chain_unwired') !== -1, 'names chain refuse');
assert(page.indexOf('IxState') !== -1, 'named refuse surface');
assert(page.indexOf("intafaced.ops.custody.keysEmpty") !== -1, 'empty keys copy');
assert(page.indexOf("intafaced.ops.custody.approvalsEmpty") !== -1, 'empty approvals copy');

assert(routes.indexOf("path: '/ops'") !== -1, '/ops route');
assert(routes.indexOf('pages/intafaced/Ops') !== -1, 'Ops.vue route target');

var addBlock = page.match(/addApproval\(\)\s*\{[\s\S]*?\n    \}/);
assert(Boolean(addBlock), 'addApproval present');
if (addBlock) {
  var body = addBlock[0];
  assert(/amount/.test(body), 'amount sent when present');
  assert(body.indexOf('Number(') === -1, 'amount not Number()');
  assert(body.indexOf('parseFloat') === -1, 'amount not parseFloat');
  assert(body.indexOf('parseInt') === -1, 'amount not parseInt');
  assert(body.indexOf('+this.approvalForm.amount') === -1, 'amount not unary-plus');
  assert(!/amount:\s*['"]0(\.0+)?['"]/.test(body), 'no default 0 amount');
  assert(body.indexOf('privateKey') === -1, 'no privateKey on create');
  assert(body.indexOf('mnemonic') === -1, 'no mnemonic on create');
}

assert(page.indexOf('Number(') === -1, 'no Number() on this page — amounts stay strings');
assert(page.indexOf('parseFloat') === -1, 'no parseFloat on this page');
assert(!/privateKey|mnemonic|seed phrase/i.test(page), 'no invented keys on page');
assert(!/0x[0-9a-fA-F]{16,}/.test(page), 'no hex key material on page');

assert(lang.indexOf('custody:') !== -1, 'en intafaced.ops.custody');
var copy = require('../lang/en.js').intafaced.ops.custody;
assert(copy && typeof copy === 'object', 'en.js intafaced.ops.custody object');
['title', 'api', 'lead', 'wrapUnset', 'chainUnwired', 'keysEmpty', 'approvalsEmpty', 'request', 'execute', 'cold', 'warm', 'hot'].forEach(function (key) {
  assert(Boolean(copy[key]), 'en.js intafaced.ops.custody.' + key);
});
if (copy) {
  var blob = JSON.stringify(copy);
  assert(blob.indexOf('ops.custody_wrap_unset') !== -1, 'en copy names wrap refuse');
  assert(!/privateKey|mnemonic|\$0|0\.00 default/i.test(blob), 'en copy invents no keys or balances');
}

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('ops-custody.golden: ok');
process.exit(0);
