'use strict';

/**
 * remaining-SOT M07-R11 / §12.4 — duplicate-tab submit lock.
 *
 * Run from 05_Web_Front: node src/assets/js/ix-dup-tab-lock.golden.js
 */
var fs = require('fs');
var path = require('path');
var failed = 0;

function assert(condition, name) {
  if (!condition) {
    failed += 1;
    console.error('FAIL:', name);
  } else {
    console.log('ok:', name);
  }
}

var lockModule = require('./ix-dup-tab-lock.js');
var vue = fs.readFileSync(path.join(__dirname, '../../pages/exchange/Exchange.vue'), 'utf8');

assert(lockModule.STORAGE_KEY === 'ix.desk.submit-lock', 'non-bearer storage key');
assert(lockModule.CHANNEL_NAME === 'ix.desk.submit-lock', 'channel name matches storage key');

assert(lockModule.parseLock(null) === null, 'empty is not a lock');
assert(lockModule.parseLock('{"ts":1,"clientOrderId":"desk-a"}').clientOrderId === 'desk-a', 'parses ts+id');
assert(
  lockModule.parseLock('{"ts":1,"clientOrderId":"desk-a","token":"x"}') === null,
  'token field is refused'
);
assert(
  lockModule.parseLock('{"ts":1,"clientOrderId":"desk-a","member":{}}') === null,
  'member field is refused'
);
assert(
  lockModule.parseLock('{"ts":1,"clientOrderId":"desk-a","bearer":"x"}') === null,
  'bearer field is refused'
);
assert(lockModule.parseLock('{"ts":1,"clientOrderId":""}') === null, 'empty clientOrderId is not held');
assert(lockModule.timeoutOutcome(999999) === 'unknown', 'timeout is unknown, not applied');
assert(lockModule.timeoutOutcome(0) !== 'applied', 'elapsed zero is still not success');

var posted = [];
var closed = false;
var broadcastInstance = null;
function FakeBroadcastChannel(name) {
  broadcastInstance = this;
  this.name = name;
  this.postMessage = function (message) {
    posted.push(message);
  };
  this.close = function () {
    closed = true;
  };
}

var store = {};
function makeStorage() {
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem: function (key, value) {
      store[key] = String(value);
    },
    removeItem: function (key) {
      delete store[key];
    }
  };
}

var remoteHeld = [];
var tabA = lockModule.createDupTabLock(
  { BroadcastChannel: FakeBroadcastChannel, localStorage: makeStorage() },
  function (payload) {
    remoteHeld.push(payload);
  }
);
assert(tabA.transport === 'broadcast-channel', 'BroadcastChannel preferred');
assert(tabA.acquire('desk-one', 1000) === true, 'acquire stores lock');
assert(posted.length === 1, 'acquire broadcasts once');
assert(posted[0].ts === 1000 && posted[0].clientOrderId === 'desk-one', 'broadcast is ts+clientOrderId');
assert(JSON.stringify(posted[0]).indexOf('token') === -1, 'broadcast contains no token field');
assert(JSON.stringify(posted[0]).indexOf('member') === -1, 'broadcast contains no member field');
assert(store[lockModule.STORAGE_KEY].indexOf('desk-one') !== -1, 'storage holds clientOrderId');
assert(store[lockModule.STORAGE_KEY].indexOf('token') === -1, 'storage holds no token');
assert(tabA.acquire('desk-two', 1001) === false, 'second tab cannot replace a live lock');
assert(tabA.read().clientOrderId === 'desk-one', 'losing acquire leaves original id');

broadcastInstance.onmessage({ data: posted[0] });
assert(remoteHeld.length === 1 && remoteHeld[0].clientOrderId === 'desk-one', 'remote tab treats as submitting');
assert(lockModule.isHeld(remoteHeld[0]) === true, 'held payload is submitting/recovery');

assert(tabA.acquire('desk-one', 1002) === true, 'same clientOrderId may re-acquire');
tabA.release(1003);
assert(tabA.read() === null, 'release clears storage');
assert(!Object.prototype.hasOwnProperty.call(store, lockModule.STORAGE_KEY), 'release removes key');
var releaseMsg = posted[posted.length - 1];
assert(releaseMsg.clientOrderId == null, 'release broadcast has no id');
broadcastInstance.onmessage({ data: releaseMsg });
assert(remoteHeld[remoteHeld.length - 1] === null, 'remote tab unlocks on release');
tabA.close();
assert(closed, 'BroadcastChannel closes');

store = {};
var storageWrites = [];
var listeners = {};
var fallbackWindow = {
  localStorage: {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem: function (key, value) {
      store[key] = String(value);
      storageWrites.push(['set', key, value]);
    },
    removeItem: function (key) {
      delete store[key];
      storageWrites.push(['remove', key]);
    }
  },
  addEventListener: function (name, fn) {
    listeners[name] = fn;
  },
  removeEventListener: function (name) {
    delete listeners[name];
  }
};
var fallbackHeld = [];
var fallback = lockModule.createDupTabLock(fallbackWindow, function (payload) {
  fallbackHeld.push(payload);
});
assert(fallback.transport === 'storage-event', 'storage event is the fallback');
assert(fallback.acquire('desk-fb', 2000) === true, 'fallback acquire writes lock');
assert(storageWrites[0][1] === lockModule.STORAGE_KEY, 'fallback writes only submit-lock key');
assert(JSON.parse(storageWrites[0][2]).clientOrderId === 'desk-fb', 'fallback payload is ts+id');
listeners.storage({ key: lockModule.STORAGE_KEY, newValue: store[lockModule.STORAGE_KEY] });
assert(fallbackHeld[0] && fallbackHeld[0].clientOrderId === 'desk-fb', 'remote storage event locks');
listeners.storage({ key: 'TOKEN', newValue: 'forged' });
assert(fallbackHeld.length === 1, 'legacy token storage is ignored');
fallback.release(2001);
listeners.storage({ key: lockModule.STORAGE_KEY, newValue: null });
assert(fallbackHeld[fallbackHeld.length - 1] === null, 'storage remove releases');
fallback.close();
assert(!listeners.storage, 'storage listener closes');

var none = lockModule.createDupTabLock(null, function () {});
assert(none.transport === 'none', 'non-browser use is inert');
assert(none.acquire('desk-x') === false, 'no window cannot acquire');

assert(/ix-dup-tab-lock\.js/.test(vue), 'Exchange.vue imports ix-dup-tab-lock');
assert(/createDupTabLock\(/.test(vue), 'Exchange.vue creates the lock channel');
var submitFn = vue.match(/submitOrder\(\)\s*\{[\s\S]*?\n    \},/);
assert(submitFn, 'submitOrder method');
assert(
  /dupTabLockHeld|acquireDupTabSubmitLock/.test(submitFn[0]),
  'submitOrder refuses or acquires the shared lock'
);
assert(/acquireDupTabSubmitLock\(/.test(vue), 'submit path acquires');
assert(
  /placeOrder\(\)[\s\S]*acquireDupTabSubmitLock\(/.test(vue) || /submitOrderAfterAdl\(\)[\s\S]*acquireDupTabSubmitLock\(/.test(vue),
  'acquire is on the write path'
);
assert(/persistPendingOutcome\(\)\s*\{[\s\S]*?releaseDupTabSubmitLock\(/.test(vue), 'pendingOutcome settle releases');
assert(/recordUnknownOutcome\(action, verdict, details\)[\s\S]*?releaseDupTabSubmitLock\(/.test(vue), 'unknown outcome releases');
assert(/placeOrder\(\)\s*\{[\s\S]*?releaseDupTabSubmitLock\(/.test(vue), 'placeOrder outcome releases');
var lockCall = vue.match(/classifyOrderBlock\(\{[\s\S]*?\}\)/);
assert(lockCall, 'deskLock classifyOrderBlock object');
assert(/dupTabLockHeld/.test(lockCall[0]), 'deskLock submitting path includes dup-tab lock');
assert(!/localStorage\.setItem\([^)]*TOKEN/.test(vue), 'does not persist TOKEN');
assert(!/localStorage\.setItem\([^)]*MEMBER/.test(vue), 'does not persist MEMBER');

if (failed) {
  console.error(failed + ' golden failure(s)');
  process.exit(1);
}
console.log('\nix-dup-tab-lock.golden: all passed');
