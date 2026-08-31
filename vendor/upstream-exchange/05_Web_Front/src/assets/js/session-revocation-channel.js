/**
 * Token-free cross-tab session invalidation.
 *
 * Access/refresh credentials remain memory-only. This channel carries one
 * non-authoritative fact: another same-origin tab cleared its session, so this
 * tab must fail closed too. BroadcastChannel is preferred; the storage event
 * fallback writes and immediately removes a nonce, never a credential.
 */
'use strict';

var CHANNEL_NAME = 'intafaced-session-control-v1';
var STORAGE_KEY = 'INTAFACED_SESSION_REVOKED_EVENT';
var REVOKE_MESSAGE = 'session-revoked';

function isRevocation(data) {
  return !!data && data.version === 1 && data.type === REVOKE_MESSAGE;
}

function createSessionRevocationChannel(browserWindow, onRevoke) {
  var win = browserWindow;
  var callback = typeof onRevoke === 'function' ? onRevoke : function () {};
  var broadcastChannel = null;
  var storageListener = null;

  if (!win) {
    return { broadcast: function () {}, close: function () {}, transport: 'none' };
  }

  if (typeof win.BroadcastChannel === 'function') {
    try {
      broadcastChannel = new win.BroadcastChannel(CHANNEL_NAME);
      broadcastChannel.onmessage = function (event) {
        if (isRevocation(event && event.data)) callback();
      };
    } catch (e) {
      broadcastChannel = null;
    }
  }

  if (!broadcastChannel && typeof win.addEventListener === 'function') {
    storageListener = function (event) {
      if (event && event.key === STORAGE_KEY && event.newValue) callback();
    };
    win.addEventListener('storage', storageListener);
  }

  return {
    transport: broadcastChannel ? 'broadcast-channel' : storageListener ? 'storage-event' : 'none',
    broadcast: function () {
      if (broadcastChannel) {
        broadcastChannel.postMessage({ version: 1, type: REVOKE_MESSAGE });
        return;
      }
      try {
        var nonce = String(Date.now()) + ':' + String(Math.random());
        win.localStorage.setItem(STORAGE_KEY, nonce);
        win.localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        // Private mode/storage refusal: this tab is already cleared locally.
      }
    },
    close: function () {
      if (broadcastChannel && typeof broadcastChannel.close === 'function') {
        broadcastChannel.close();
      }
      if (storageListener && typeof win.removeEventListener === 'function') {
        win.removeEventListener('storage', storageListener);
      }
    },
  };
}

module.exports = {
  CHANNEL_NAME: CHANNEL_NAME,
  STORAGE_KEY: STORAGE_KEY,
  REVOKE_MESSAGE: REVOKE_MESSAGE,
  isRevocation: isRevocation,
  createSessionRevocationChannel: createSessionRevocationChannel,
};
