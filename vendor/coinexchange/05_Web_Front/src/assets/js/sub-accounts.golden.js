/**
 * Golden tests for sub-accounts.js — no jest required.
 * Run from 05_Web_Front:  node src/assets/js/sub-accounts.golden.js
 */
'use strict';

var path = require('path');
var sa = require(path.join(__dirname, 'sub-accounts.js'));

var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

var UUID_A = '11111111-1111-4111-8111-111111111111';
var UUID_B = '22222222-2222-4222-8222-222222222222';

// normalizeList
assert(sa.normalizeList(null).length === 0, 'null → []');
assert(sa.normalizeList(undefined).length === 0, 'undef → []');
assert(sa.normalizeList('x').length === 0, 'non-array → []');
assert(sa.normalizeList([{ id: 'not-a-uuid', label: 'x' }]).length === 0, 'reject non-uuid');
assert(sa.normalizeList([{ id: UUID_A, label: '  bot  ', purpose: null, revoked: false }])[0].label === 'bot', 'trim label');
assert(sa.normalizeList([{ id: UUID_A }])[0].label === UUID_A.slice(0, 8), 'missing label → id prefix');
assert(sa.normalizeList([{ id: UUID_A, revoked: true }])[0].revoked === true, 'revoked flag');

// selectorOptions — parent first, skip revoked
var opts = sa.selectorOptions([
  { id: UUID_A, label: 'alpha', revoked: false },
  { id: UUID_B, label: 'dead', revoked: true }
]);
assert(opts.length === 2, 'parent + one active');
assert(opts[0].isParent === true && opts[0].id === sa.PARENT_ID, 'parent first');
assert(opts[1].id === UUID_A && opts[1].label === 'alpha', 'active sub only');

// trade routing honesty
assert(sa.TRADE_ROUTING_READY === false, 'routing flag off until M5');
assert(sa.canPlaceOrder(null) === true, 'parent can trade');
assert(sa.canPlaceOrder(sa.PARENT_ID) === true, 'PARENT_ID can trade');
assert(sa.canPlaceOrder(UUID_A) === false, 'sub cannot trade yet');
assert(sa.tradeBlockReason(null) === '', 'no block on parent');
assert(sa.tradeBlockReason(UUID_A).indexOf('not wired') >= 0, 'block copy names not wired');
assert(sa.tradeBlockReason(UUID_A).indexOf('Parent') >= 0, 'block copy points to Parent');

// triggerLabel
assert(sa.triggerLabel(null, []) === 'Parent', 'trigger parent');
assert(sa.triggerLabel(UUID_A, [{ id: UUID_A, label: 'mm-bot' }]) === 'mm-bot', 'trigger by label');
assert(sa.triggerLabel(UUID_B, [{ id: UUID_A, label: 'mm-bot' }]) === 'Unknown sub-account', 'missing → unknown not invent');

// statusNote
assert(sa.statusNote({ hasToken: false }).indexOf('platform session') >= 0, 'no token honesty');
assert(sa.statusNote({ hasToken: true, loading: true }).indexOf('Loading') >= 0, 'loading');
assert(
  sa.statusNote({ hasToken: true, reason: 'unauthorized' }).indexOf('not empty') >= 0,
  'error ≠ empty'
);
assert(
  sa.statusNote({ hasToken: true, reason: 'ok', list: [] }).indexOf('parent only') >= 0,
  'empty list honest'
);
assert(
  sa.statusNote({ hasToken: true, reason: 'ok', list: [{ id: UUID_A, label: 'a', revoked: false }], selectedId: null })
    .indexOf('1 sub-account') >= 0,
  'count active'
);
assert(
  sa.statusNote({
    hasToken: true,
    reason: 'ok',
    list: [{ id: UUID_A, label: 'a', revoked: false }],
    selectedId: UUID_A
  }).indexOf('not wired') >= 0,
  'selected sub → routing note'
);

// coerceSelection
assert(sa.coerceSelection(null, [{ id: UUID_A }]) === sa.PARENT_ID, 'null stays parent');
assert(sa.coerceSelection(UUID_A, [{ id: UUID_A, revoked: false }]) === UUID_A, 'keep valid');
assert(sa.coerceSelection(UUID_A, [{ id: UUID_A, revoked: true }]) === sa.PARENT_ID, 'revoked → parent');
assert(sa.coerceSelection(UUID_B, [{ id: UUID_A, revoked: false }]) === sa.PARENT_ID, 'missing → parent');

if (failed) {
  console.error('\n' + failed + ' sub-accounts golden test(s) failed');
  process.exit(1);
}
console.log('\nall sub-accounts golden tests passed');
