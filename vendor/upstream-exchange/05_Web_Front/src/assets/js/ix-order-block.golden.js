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

function keyOf(state) {
  var r = block.classifyOrderBlock(state);
  return r ? r.key : null;
}

assert(block.classifyOrderBlock({}) === null, 'empty state not blocked invent');
assert(keyOf({ isLogin: false }) === 'not_signed_in', 'not signed in');
assert(keyOf({ isLogin: true, marketHalted: true }) === 'market_halted', 'halt');
assert(keyOf({ isLogin: true, tradable: false }) === 'not_tradable', 'not tradable');
assert(keyOf({ isLogin: true, tradable: true, feedLive: false }) === 'feed_down', 'feed down');
assert(
  keyOf({ isLogin: true, tradable: true, feedLive: true, walletReachable: false }) === 'wallet_unreachable',
  'wallet',
);
assert(
  keyOf({ isLogin: true, tradable: true, feedLive: true, walletReachable: true, submitting: true }) === 'submitting',
  'submitting first',
);

assert(keyOf({ isLogin: true, recoveryLocked: true }) === 'recovery_locked', 'recovery lock');
assert(
  block.classifyOrderBlock({ isLogin: true, recoveryLocked: true }).message === 'Not trading-ready after reconnect.',
  'recovery lock copy',
);
assert(keyOf({ isLogin: true, orderEntryLocked: true }) === 'order_entry_locked', 'order-entry lock');
assert(
  block.classifyOrderBlock({ isLogin: true, orderEntryLocked: true }).message === 'Order entry is locked.',
  'order-entry lock copy',
);
assert(keyOf({ isLogin: true, tradingEnabled: false }) === 'trading_disabled', 'trading disabled');
assert(
  block.classifyOrderBlock({ isLogin: true, tradingEnabled: false }).message === 'Trading is disabled.',
  'trading disabled copy',
);

assert(keyOf({ recoveryLocked: false, orderEntryLocked: false, tradingEnabled: true }) === null, 'unset-false locks do not invent');
assert(keyOf({ isLogin: true, recoveryLocked: false }) === null, 'recoveryLocked false not blocked');
assert(keyOf({ isLogin: true, orderEntryLocked: false }) === null, 'orderEntryLocked false not blocked');
assert(keyOf({ isLogin: true, tradingEnabled: true }) === null, 'tradingEnabled true not blocked');

assert(
  keyOf({
    submitting: true,
    isLogin: false,
    recoveryLocked: true,
    orderEntryLocked: true,
    tradingEnabled: false,
    marketHalted: true
  }) === 'submitting',
  'submitting beats all locks',
);
assert(
  keyOf({
    isLogin: false,
    recoveryLocked: true,
    orderEntryLocked: true,
    tradingEnabled: false
  }) === 'not_signed_in',
  'not signed in beats recovery',
);
assert(
  keyOf({
    isLogin: true,
    recoveryLocked: true,
    orderEntryLocked: true,
    tradingEnabled: false,
    marketHalted: true
  }) === 'recovery_locked',
  'recovery beats order-entry',
);
assert(
  keyOf({
    isLogin: true,
    orderEntryLocked: true,
    tradingEnabled: false,
    marketHalted: true
  }) === 'order_entry_locked',
  'order-entry beats trading disabled',
);
assert(
  keyOf({
    isLogin: true,
    tradingEnabled: false,
    marketHalted: true,
    tradable: false
  }) === 'trading_disabled',
  'trading disabled beats halt',
);
assert(
  keyOf({
    isLogin: true,
    recoveryLocked: true,
    tradable: false,
    feedLive: false,
    walletReachable: false
  }) === 'recovery_locked',
  'recovery beats market/feed/wallet',
);

if (failed) {
  console.error(failed + ' golden failure(s)');
  process.exit(1);
}
console.log('all ix-order-block golden tests passed');
