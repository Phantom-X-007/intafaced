#!/usr/bin/env node
/**
 * Honesty lock for custody / recharge / withdraw status copy.
 * Run from 05_Web_Front: node src/assets/js/custody-status.golden.js
 *
 * Fail-first: Platform ledger and Venue trading must not read "Live" without
 * a probe. Unknown/unset is the honest state. CustodyNotBuilt stays the
 * product — this screen does not invent a custody rail.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

var failed = 0;
function assert(cond, name) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

var custody = read('components/uc/CustodyNotBuilt.vue');
var recharge = read('components/uc/Recharge.vue');
var withdraw = read('components/uc/Withdraw.vue');
var address = read('components/uc/WithdrawAddress.vue');

assert(custody.indexOf('CustodyNotBuilt') !== -1, 'shared refusal is still CustodyNotBuilt');
assert(recharge.indexOf('CustodyNotBuilt') !== -1, 'recharge stays the shared refusal');
assert(withdraw.indexOf('CustodyNotBuilt') !== -1, 'withdraw stays the shared refusal');
assert(address.indexOf('CustodyNotBuilt') !== -1, 'withdraw address stays the shared refusal');

assert(custody.indexOf('<dd>Live</dd>') === -1, 'MUTATION no unprobed Live status');
assert(/<dd>\s*Live\s*<\/dd>/.test(custody) === false, 'MUTATION no Live dd even with whitespace');
assert(custody.indexOf('Platform ledger') !== -1, 'platform ledger row present');
assert(custody.indexOf('Venue trading') !== -1, 'venue trading row present');
assert(custody.indexOf('Chain custody') !== -1, 'chain custody row present');

assert(
  /Platform ledger<\/dt><dd>Unknown/.test(custody) || /Platform ledger<\/dt><dd>Unset/.test(custody),
  'platform ledger is Unknown/Unset — not Live, no probe'
);
assert(
  /Venue trading<\/dt><dd>Unknown/.test(custody) || /Venue trading<\/dt><dd>Unset/.test(custody),
  'venue trading is Unknown/Unset — not Live, no probe'
);
assert(/Chain custody<\/dt><dd>Not live/.test(custody), 'chain custody stays Not live');

assert(custody.indexOf('#0f0') === -1 && custody.indexOf('green') === -1, 'no green Live paint');
assert(recharge.indexOf('wallet_rpc') === -1, 'recharge does not invent wallet-RPC');
assert(withdraw.indexOf('/uc/withdraw/create') === -1, 'withdraw does not restore Java create');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('custody-status.golden: ok');
process.exit(0);
