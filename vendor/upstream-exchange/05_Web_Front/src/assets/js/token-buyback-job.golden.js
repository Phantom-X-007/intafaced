#!/usr/bin/env node
/**
 * Fail-first: Token.vue buyback card runs buyback.runWindow({ runId, revenueWindow }).
 * Fill comes from placeIocMarketBuy on the internal book — never operator-typed
 * tokensBought. Empty book is token.buyback_book_empty. Off/unset is
 * token.buyback_job_unset. Burn is the service figure.
 *
 * Run from 05_Web_Front: node src/assets/js/token-buyback-job.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '../../');
var jobPath = path.join(__dirname, '../../../../../../services/svc-token/src/buyback-job.ts');
var clientPath = path.join(__dirname, '../../../../../../services/svc-token/src/buyback-trade-client.ts');
var routerPath = path.join(__dirname, '../../../../../../services/svc-token/src/router.ts');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/Token.vue'), 'utf8');
var lang = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');
var job = fs.readFileSync(jobPath, 'utf8');
var client = fs.readFileSync(clientPath, 'utf8');
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

assert(/export async function runBuybackWindow\s*\(/.test(job), 'runBuybackWindow exported');
var sig = job.match(/export async function runBuybackWindow\s*\(([\s\S]*?)\)\s*(?::\s*Promise)?/);
assert(Boolean(sig), 'runBuybackWindow signature readable');
if (sig) {
  assert(sig[1].indexOf('tokensBought') === -1, 'runBuybackWindow params have no tokensBought');
}
assert(job.indexOf('placeIocMarketBuy') !== -1, 'job calls placeIocMarketBuy');
assert(job.indexOf('buybackBudget') !== -1, 'job sizes spend with buybackBudget');
assert(job.indexOf('token.buyback_book_empty') !== -1, 'job names token.buyback_book_empty');
assert(job.indexOf('token.buyback_job_unset') !== -1, 'job names token.buyback_job_unset');
assert(job.indexOf('settleBuyback') !== -1, 'job settles after the fill');

assert(client.indexOf('/api/v1/orders') !== -1, 'live client POSTs /api/v1/orders');
assert(client.indexOf("timeInForce: 'IOC'") !== -1, 'live client is IOC');
assert(client.indexOf("type: 'market'") !== -1, 'live client is market');
assert(client.indexOf("side: 'buy'") !== -1, 'live client is buy');
assert(client.indexOf('orderbook') !== -1, 'live client reads the book');

var buybackRouter = router.match(/buyback:\s*router\(\{[\s\S]*?\n    \}\)/);
assert(Boolean(buybackRouter), 'router nests buyback.runWindow');
if (buybackRouter) {
  var body = buybackRouter[0];
  var inputHalf = body.split('.output')[0];
  assert(body.indexOf('runWindow:') !== -1, 'buyback.runWindow present');
  assert(inputHalf.indexOf('tokensBought') === -1, 'buyback.runWindow input has no tokensBought');
  assert(body.indexOf('runId:') !== -1, 'buyback.runWindow takes runId');
}

assert(page.indexOf("mutate('token', 'buyback.runWindow'") !== -1, 'Token.vue mutates buyback.runWindow');
assert(page.indexOf('tokensBought:') === -1, 'Token.vue does not type tokensBought');
assert(page.indexOf('recordBuyback') === -1, 'Token.vue does not call recordBuyback');
assert(page.indexOf('token.buyback_book_empty') !== -1, 'Token.vue names token.buyback_book_empty');
assert(page.indexOf('intafaced.token.buybackBurned') !== -1, 'burned copy keyed');
assert(page.indexOf('Number(') === -1, 'no Number( on Token.vue');
assert(page.indexOf('parseFloat') === -1, 'no parseFloat on Token.vue');
assert(page.indexOf('parseInt') === -1, 'no parseInt on Token.vue');

assert(lang.indexOf('buybackBurned:') !== -1, 'en.js buybackBurned');
assert(lang.indexOf('buybackRun:') !== -1, 'en.js buybackRun');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('token-buyback-job.golden: ok');
process.exit(0);
