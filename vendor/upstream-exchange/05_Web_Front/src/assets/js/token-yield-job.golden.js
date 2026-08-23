#!/usr/bin/env node
/**
 * Fail-first: Token.vue yield card runs yield.runWindow({ windowId }).
 * Amounts come from houseFees via ledger-client — never caller-typed
 * sources[].amount. Off/unset is token.yield_job_unset. Paid is the
 * service figure.
 *
 * Run from 05_Web_Front: node src/assets/js/token-yield-job.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '../../');
var jobPath = path.join(__dirname, '../../../../../../services/svc-token/src/yield-job.ts');
var routerPath = path.join(__dirname, '../../../../../../services/svc-token/src/router.ts');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/Token.vue'), 'utf8');
var lang = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');
var job = fs.readFileSync(jobPath, 'utf8');
var router = fs.readFileSync(routerPath, 'utf8');

var failed = 0;
function assert(cond, name) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

assert(/export async function runYieldWindow\s*\(/.test(job), 'runYieldWindow exported');
var sig = job.match(/export async function runYieldWindow\s*\(([\s\S]*?)\)\s*(?::\s*Promise)?/);
assert(Boolean(sig), 'runYieldWindow signature readable');
if (sig) {
  assert(sig[1].indexOf('sources') === -1, 'runYieldWindow params have no sources');
  assert(sig[1].indexOf('amount') === -1, 'runYieldWindow params have no amount');
}
assert(job.indexOf('balance(houseFees') !== -1, 'job reads ledger.balance(houseFees)');
assert(job.indexOf('token.yield_job_unset') !== -1, 'job names token.yield_job_unset');
assert(job.indexOf('distributeRevenue') !== -1, 'job calls distributeRevenue');

var yieldRouter = router.match(/yield:\s*router\(\{[\s\S]*?\n    \}\)/);
assert(Boolean(yieldRouter), 'router nests yield.runWindow');
if (yieldRouter) {
  var body = yieldRouter[0];
  assert(body.indexOf('runWindow:') !== -1, 'yield.runWindow present');
  assert(body.indexOf('sources:') === -1, 'yield.runWindow input has no sources');
  assert(body.indexOf('amount:') === -1 || body.indexOf('distributed:') !== -1, 'yield.runWindow does not take amount input');
}

assert(page.indexOf("mutate('token', 'yield.runWindow'") !== -1, 'Token.vue mutates yield.runWindow');
assert(page.indexOf('windowId: this.yieldWindow') !== -1, 'Token.vue sends windowId only');
assert(page.indexOf('intafaced.token.yieldPaid') !== -1, 'paid copy keyed');
assert(page.indexOf('token.yield_job_unset') !== -1, 'Token.vue names token.yield_job_unset');
assert(page.indexOf('sources:') === -1, 'Token.vue has no sources[]');
assert(page.indexOf('distributeRevenue') === -1, 'Token.vue does not call distributeRevenue');
assert(page.indexOf('Number(') === -1, 'no Number( on Token.vue');
assert(page.indexOf('parseFloat') === -1, 'no parseFloat on Token.vue');
assert(page.indexOf('parseInt') === -1, 'no parseInt on Token.vue');

assert(lang.indexOf('yieldPaid:') !== -1, 'en.js yieldPaid');
assert(lang.indexOf('yieldRun:') !== -1, 'en.js yieldRun');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('token-yield-job.golden: ok');
process.exit(0);
