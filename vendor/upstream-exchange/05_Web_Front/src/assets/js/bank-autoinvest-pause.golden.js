#!/usr/bin/env node
/**
 * Honesty lock for bank/Cards.vue auto-invest pause / resume / cancel.
 * Run from 05_Web_Front: node src/assets/js/bank-autoinvest-pause.golden.js
 *
 * Fail-first: the page must call autoInvest.pause / resume / cancel with
 * {ruleId}. Pause does not invent missed windows. Cancel does not reverse
 * past runs. Named refuse bank.not_owner stays named via IxState.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/bank/Cards.vue'), 'utf8');
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
  page.indexOf("mutate('bank', 'autoInvest.pause'") !== -1,
  'pause mutate present'
);
assert(
  page.indexOf("mutate('bank', 'autoInvest.resume'") !== -1,
  'resume mutate present'
);
assert(
  page.indexOf("mutate('bank', 'autoInvest.cancel'") !== -1,
  'cancel mutate present'
);
assert(page.indexOf('{ ruleId: rule.id }') !== -1, 'ruleId is the rule id');
assert(page.indexOf("status === 'active'") !== -1, 'Pause on active');
assert(page.indexOf("status === 'paused'") !== -1, 'Resume on paused');
assert(page.indexOf("status !== 'cancelled'") !== -1, 'Cancel until cancelled');
assert(
  page.indexOf('intafaced.bank.autoInvest.pause') !== -1,
  'pause i18n on the page'
);
assert(
  page.indexOf('intafaced.bank.autoInvest.resume') !== -1,
  'resume i18n on the page'
);
assert(
  page.indexOf('intafaced.bank.autoInvest.cancel') !== -1,
  'cancel i18n on the page'
);
assert(page.indexOf('bank.not_owner') !== -1, 'named refuse bank.not_owner stays named');
assert(page.indexOf("reason === 'bank.") === -1, 'named refuse not remapped');
assert(page.indexOf('Number(') === -1, 'no Number( on this page — amounts stay strings');
assert(page.indexOf('parseFloat') === -1, 'no parseFloat on this page');
assert(page.indexOf('parseInt') === -1, 'no parseInt on this page');
assert(page.indexOf('skippedWhilePaused') === -1, 'pause does not invent missed windows');
assert(!/\brefund/i.test(page), 'cancel does not reverse past runs');

assert(en.indexOf('pauseDone:') !== -1, 'en.js pauseDone');
assert(en.indexOf('resumeDone:') !== -1, 'en.js resumeDone');
assert(en.indexOf('cancelDone:') !== -1, 'en.js cancelDone');
assert(en.indexOf('autoInvest:') !== -1, 'en.js autoInvest nest');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('bank-autoinvest-pause.golden: ok');
process.exit(0);
