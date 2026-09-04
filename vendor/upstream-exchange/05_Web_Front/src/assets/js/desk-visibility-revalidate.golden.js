/**
 * Golden: remaining-SOT §12.4 — on visibility/focus/reconnect, private and
 * market snapshots revalidate; elapsed client time does not prove freshness.
 *
 * Run from 05_Web_Front:
 *   node src/assets/js/desk-visibility-revalidate.golden.js
 *
 * Failed ≠ empty ≠ zero. Retry never turns unknown into success.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vis = require('./desk-visibility-revalidate.js');

var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

assert(typeof vis.shouldRevalidate === 'function', 'shouldRevalidate export');
assert(vis.shouldRevalidate({ type: 'visibilitychange', visibilityState: 'hidden' }) === false, 'hidden does not revalidate');
assert(vis.shouldRevalidate({ type: 'visibilitychange', visibilityState: 'visible' }) === true, 'visible revalidates');
assert(
  vis.shouldRevalidate({ type: 'visibilitychange', visibilityState: 'visible', lastFetchAgoMs: 0 }) === true,
  'visible revalidates even if last fetch was just now'
);
assert(
  vis.shouldRevalidate({ type: 'visibilitychange', visibilityState: 'visible', lastFetchAgoMs: 50 }) === true,
  'visible revalidates even if last fetch was 50ms ago'
);
assert(vis.shouldRevalidate({ type: 'focus', lastFetchAgoMs: 0 }) === true, 'focus revalidates; elapsed does not skip');
assert(vis.shouldRevalidate({ type: 'online', lastFetchAgoMs: 0 }) === true, 'online/reconnect revalidates; elapsed does not skip');
assert(vis.shouldRevalidate({ type: 'visibilitychange' }) === false, 'visibilitychange without visible is not a revalidate');
assert(vis.shouldRevalidate(null) === false, 'null event does not revalidate');
assert(vis.elapsedProvesFreshness(0) === false, '0ms elapsed does not prove freshness');
assert(vis.elapsedProvesFreshness(1) === false, '1ms elapsed does not prove freshness');
assert(vis.elapsedProvesFreshness(60000) === false, '60s elapsed does not prove freshness');

var deskLoaders = vis.snapshotLoadersFor('exchange');
assert(deskLoaders.indexOf('getPlate') !== -1, 'desk revalidate includes book getPlate');
assert(deskLoaders.indexOf('loadAccount') !== -1, 'desk revalidate includes loadAccount (wallet + open orders)');
assert(vis.snapshotLoadersFor('money').indexOf('getMoney') !== -1, 'money revalidate includes getMoney');

var vuePath = path.join(__dirname, '../../pages/exchange/Exchange.vue');
var vue = fs.readFileSync(vuePath, 'utf8');
assert(/desk-visibility-revalidate\.js/.test(vue), 'Exchange.vue requires desk-visibility-revalidate');
assert(/document\.addEventListener\(\s*['"]visibilitychange['"]/.test(vue), 'Exchange.vue listens for visibilitychange');
assert(/document\.removeEventListener\(\s*['"]visibilitychange['"]/.test(vue), 'Exchange.vue removes visibilitychange on destroy');
assert(/window\.addEventListener\(\s*['"]focus['"]/.test(vue), 'Exchange.vue listens for focus');
assert(/window\.addEventListener\(\s*['"]online['"]/.test(vue), 'Exchange.vue listens for online/reconnect');
assert(/this\.getPlate\(\)/.test(vue) && /this\.loadAccount\(\)/.test(vue), 'Exchange.vue calls existing getPlate and loadAccount');
assert(
  /revalidateSnapshots[\s\S]{0,400}this\.getPlate\(\)[\s\S]{0,200}this\.loadAccount\(\)/.test(vue),
  'visibility revalidate calls existing getPlate then loadAccount'
);
assert(!/lastFetchAgoMs\s*[<>=]/.test(vue), 'Exchange.vue does not skip revalidate on elapsed client time');
assert(!/Date\.now\(\)\s*-\s*this\._lastSnapshot/.test(vue), 'Exchange.vue has no last-snapshot age skip');

var moneyPath = path.join(__dirname, '../../components/uc/MoneyIndex.vue');
var money = fs.readFileSync(moneyPath, 'utf8');
assert(/document\.addEventListener\(\s*['"]visibilitychange['"]/.test(money), 'MoneyIndex.vue listens for visibilitychange');
assert(/document\.removeEventListener\(\s*['"]visibilitychange['"]/.test(money), 'MoneyIndex.vue removes visibilitychange on destroy');
assert(
  /revalidateSnapshots[\s\S]{0,400}this\.getMoney\(\)/.test(money) ||
    /visibilityState[\s\S]{0,500}this\.getMoney\(\)/.test(money),
  'MoneyIndex visibility return calls existing getMoney'
);
assert(money.indexOf('walletReachable = true') === money.lastIndexOf('walletReachable = true') || /gate\.ok/.test(money), 'MoneyIndex still gates success on accept, does not invent live');

if (failed) {
  console.error('\n' + failed + ' golden assertion(s) failed');
  process.exit(1);
}
console.log('\ndesk-visibility-revalidate.golden: all passed');
process.exit(0);
