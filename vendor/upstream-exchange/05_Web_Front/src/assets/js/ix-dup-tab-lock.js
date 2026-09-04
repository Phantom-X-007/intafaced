/**
 * remaining-SOT M07-R11 / §12.4 — duplicate-tab submit lock.
 *
 * Two tabs must not silently double-submit. BroadcastChannel if present,
 * else memory plus a storage event. Key `ix.desk.submit-lock` stores only
 * `{ ts, clientOrderId }` — never MEMBER/TOKEN.
 *
 * Timeout is not success. Later place is allowed only after release;
 * authority remains svc-trade open orders + the existing clientOrderId.
 *
 * Golden: node src/assets/js/ix-dup-tab-lock.golden.js
 * (from 05_Web_Front cwd)
 */
'use strict';

var CHANNEL_NAME = 'ix.desk.submit-lock';
var STORAGE_KEY = 'ix.desk.submit-lock';

function forbiddenCredential(obj) {
  return !!(obj && (
    obj.token != null ||
    obj.member != null ||
    obj.bearer != null ||
    obj.ixToken != null ||
    obj.accessToken != null ||
    obj.refreshToken != null
  ));
}

function parseLock(raw) {
  if (raw == null || raw === '') return null;
  var data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (forbiddenCredential(data)) return null;
  var keys = Object.keys(data);
  for (var i = 0; i < keys.length; i += 1) {
    if (keys[i] !== 'ts' && keys[i] !== 'clientOrderId') return null;
  }
  if (typeof data.ts !== 'number' || !isFinite(data.ts)) return null;
  if (typeof data.clientOrderId !== 'string' || !data.clientOrderId) return null;
  return { ts: data.ts, clientOrderId: data.clientOrderId };
}

function isHeld(payload) {
  return !!(payload && payload.clientOrderId);
}

/** Elapsed time never becomes an accepted write. */
function timeoutOutcome(_elapsedMs) {
  return 'unknown';
}

function isReleaseMessage(data) {
  return !!(data && typeof data === 'object' && !Array.isArray(data) &&
    !forbiddenCredential(data) && data.clientOrderId == null);
}

function createDupTabLock(browserWindow, onChange) {
  var win = browserWindow;
  var callback = typeof onChange === 'function' ? onChange : function () {};
  var broadcastChannel = null;
  var storageListener = null;
  var memory = null;

  function emit(payload) {
    memory = payload;
    callback(payload);
  }

  function readStorage() {
    if (!win || !win.localStorage) return memory;
    try {
      return parseLock(win.localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      return memory;
    }
  }

  function writeStorage(payload) {
    memory = payload;
    if (!win || !win.localStorage) return;
    try {
      if (payload) win.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      else win.localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* Private mode: memory still holds this tab. */
    }
  }

  if (win && typeof win.BroadcastChannel === 'function') {
    try {
      broadcastChannel = new win.BroadcastChannel(CHANNEL_NAME);
      broadcastChannel.onmessage = function (event) {
        var held = parseLock(event && event.data);
        if (held) {
          emit(held);
          return;
        }
        if (isReleaseMessage(event && event.data)) emit(null);
      };
    } catch (e) {
      broadcastChannel = null;
    }
  }

  if (!broadcastChannel && win && typeof win.addEventListener === 'function') {
    storageListener = function (event) {
      if (!event || event.key !== STORAGE_KEY) return;
      emit(parseLock(event.newValue));
    };
    win.addEventListener('storage', storageListener);
  }

  var transport = 'none';
  if (broadcastChannel) transport = 'broadcast-channel';
  else if (storageListener) transport = 'storage-event';
  else if (win) transport = 'memory';

  return {
    transport: transport,
    read: function () {
      return readStorage();
    },
    acquire: function (clientOrderId, now) {
      var id = clientOrderId == null ? '' : String(clientOrderId);
      if (!win || !id) return false;
      var existing = readStorage();
      if (existing && existing.clientOrderId && existing.clientOrderId !== id) return false;
      var payload = { ts: typeof now === 'number' ? now : Date.now(), clientOrderId: id };
      writeStorage(payload);
      var stored = readStorage();
      if (!stored || stored.clientOrderId !== id) return false;
      if (broadcastChannel) broadcastChannel.postMessage(payload);
      return true;
    },
    release: function (now) {
      writeStorage(null);
      if (broadcastChannel) {
        broadcastChannel.postMessage({
          ts: typeof now === 'number' ? now : Date.now(),
          clientOrderId: null
        });
      }
      memory = null;
    },
    close: function () {
      if (broadcastChannel && typeof broadcastChannel.close === 'function') {
        broadcastChannel.close();
      }
      if (storageListener && win && typeof win.removeEventListener === 'function') {
        win.removeEventListener('storage', storageListener);
      }
    }
  };
}

module.exports = {
  CHANNEL_NAME: CHANNEL_NAME,
  STORAGE_KEY: STORAGE_KEY,
  parseLock: parseLock,
  isHeld: isHeld,
  timeoutOutcome: timeoutOutcome,
  createDupTabLock: createDupTabLock
};
