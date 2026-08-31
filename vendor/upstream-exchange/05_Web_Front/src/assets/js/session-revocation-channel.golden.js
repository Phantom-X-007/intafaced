'use strict';

var channelModule = require('./session-revocation-channel.js');
var failed = 0;

function assert(condition, name) {
  if (!condition) {
    failed += 1;
    console.error('FAIL:', name);
  } else {
    console.log('ok:', name);
  }
}

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
var revoked = 0;
var fakeWindow = { BroadcastChannel: FakeBroadcastChannel };
var channel = channelModule.createSessionRevocationChannel(fakeWindow, function () {
  revoked += 1;
});
assert(channel.transport === 'broadcast-channel', 'BroadcastChannel preferred');
channel.broadcast();
assert(posted.length === 1 && channelModule.isRevocation(posted[0]), 'broadcast contains revocation only');
assert(JSON.stringify(posted[0]).indexOf('token') === -1, 'broadcast contains no token field');
broadcastInstance.onmessage({ data: posted[0] });
assert(revoked === 1, 'remote BroadcastChannel message revokes once');
broadcastInstance.onmessage({ data: { version: 1, type: 'other' } });
assert(revoked === 1, 'unrelated BroadcastChannel message is ignored');
channel.close();
assert(closed, 'BroadcastChannel closes');

var storageWrites = [];
var listeners = {};
var fallbackWindow = {
  localStorage: {
    setItem: function (key, value) {
      storageWrites.push(['set', key, value]);
    },
    removeItem: function (key) {
      storageWrites.push(['remove', key]);
    },
  },
  addEventListener: function (name, fn) {
    listeners[name] = fn;
  },
  removeEventListener: function (name) {
    delete listeners[name];
  },
};
var fallbackRevoked = 0;
var fallback = channelModule.createSessionRevocationChannel(fallbackWindow, function () {
  fallbackRevoked += 1;
});
assert(fallback.transport === 'storage-event', 'storage event is the fallback');
fallback.broadcast();
assert(storageWrites[0][1] === channelModule.STORAGE_KEY, 'fallback writes only revocation key');
assert(storageWrites[1][0] === 'remove', 'fallback revocation nonce is removed immediately');
listeners.storage({ key: channelModule.STORAGE_KEY, newValue: 'nonce' });
assert(fallbackRevoked === 1, 'remote storage event revokes once');
listeners.storage({ key: 'TOKEN', newValue: 'forged' });
assert(fallbackRevoked === 1, 'legacy token storage is ignored');
fallback.close();
assert(!listeners.storage, 'storage listener closes');

var none = channelModule.createSessionRevocationChannel(null, function () {
  revoked += 1;
});
none.broadcast();
assert(none.transport === 'none' && revoked === 1, 'non-browser use is inert');

if (failed) process.exit(1);
console.log('\nsession-revocation-channel.golden: all passed');
