'use strict';
var block = require('./ix-order-block.js');
var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    failed += 1;
  } else {
    console.log('ok', msg);
  }
}

assert(block.classifyOrderBlock({}) === null, 'empty state not blocked invent');
assert(block.classifyOrderBlock({ isLogin: false }).key === 'not_signed_in', 'not signed in');
assert(block.classifyOrderBlock({ isLogin: true, marketHalted: true }).key === 'market_halted', 'halt');
assert(block.classifyOrderBlock({ isLogin: true, tradable: false }).key === 'not_tradable', 'not tradable');
assert(block.classifyOrderBlock({ isLogin: true, tradable: true, feedLive: false }).key === 'feed_down', 'feed down');
assert(
  block.classifyOrderBlock({ isLogin: true, tradable: true, feedLive: true, walletReachable: false }).key ===
    'wallet_unreachable',
  'wallet',
);
assert(
  block.classifyOrderBlock({ isLogin: true, tradable: true, feedLive: true, walletReachable: true, submitting: true })
    .key === 'submitting',
  'submitting first',
);

if (failed) {
  console.error(failed + ' golden failure(s)');
  process.exit(1);
}
console.log('all ix-order-block golden tests passed');
