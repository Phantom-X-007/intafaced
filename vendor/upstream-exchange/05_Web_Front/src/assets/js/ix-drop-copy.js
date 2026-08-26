'use strict';

/*
 * Bazaar drop-copy pane — client for svc-ws `/drop-copy/stream`.
 *
 * Independent of the trading private socket. Read-only: this file never sends
 * place/cancel. Replay is not durable. Empty + completeness `complete` is
 * refused; empty session is `RECOVERY_REQUIRED`.
 *
 * CommonJS for golden tests + webpack require.
 */

var CHANNEL = 'drop_copy';
var COMPLETENESS = {
  SESSION: 'SESSION',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
  COMMON_UPSTREAM_FAILURE: 'COMMON_UPSTREAM_FAILURE'
};
var RECOVERY_CODE = 'drop_copy.recovery_required';
var UPSTREAM_CODE = 'drop_copy.common_upstream_failure';
var GAP_CODE = 'drop_copy.gap';

function emptyView() {
  return {
    socket: 'closed',
    completeness: COMPLETENESS.RECOVERY_REQUIRED,
    replayDurable: false,
    lastSeq: 0,
    lastCode: null,
    lastType: null,
    bus: null,
    executions: []
  };
}

function cloneView(view) {
  var next = emptyView();
  var src = view || next;
  for (var key in next) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    next[key] = src[key];
  }
  next.replayDurable = false;
  next.executions = Array.isArray(src.executions) ? src.executions.slice() : [];
  return next;
}

function decimalString(value) {
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

function normalizeExecution(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.fillId !== 'string' || raw.fillId.length === 0) return null;
  var seq = raw.dropCopySeq;
  if (seq != null && !(typeof seq === 'number' && Number.isInteger(seq) && seq >= 1)) return null;
  return {
    fillId: raw.fillId,
    orderId: typeof raw.orderId === 'string' ? raw.orderId : '',
    marketId: typeof raw.marketId === 'string' ? raw.marketId : '',
    side: raw.side === 'buy' || raw.side === 'sell' ? raw.side : '',
    liquidity: typeof raw.liquidity === 'string' ? raw.liquidity : '',
    price: decimalString(raw.price),
    qty: decimalString(raw.qty),
    quoteAmount: decimalString(raw.quoteAmount),
    feeAsset: typeof raw.feeAsset === 'string' ? raw.feeAsset : '',
    feeAmount: decimalString(raw.feeAmount),
    engineSequence: typeof raw.engineSequence === 'number' && Number.isInteger(raw.engineSequence) ? raw.engineSequence : null,
    dropCopySeq: seq == null ? null : seq,
    ts: typeof raw.ts === 'string' ? raw.ts : ''
  };
}

function inventedCompleteEmpty(raw, executions) {
  if (!raw || typeof raw !== 'object') return false;
  var empty = !executions || executions.length === 0;
  var claimsComplete = raw.completeness === 'complete' || raw.complete === true;
  return empty && claimsComplete;
}

function honestCompleteness(raw, executions) {
  if (inventedCompleteEmpty(raw, executions)) return COMPLETENESS.RECOVERY_REQUIRED;
  var value = raw && raw.completeness;
  if (value === COMPLETENESS.COMMON_UPSTREAM_FAILURE) return COMPLETENESS.COMMON_UPSTREAM_FAILURE;
  if (executions.length === 0) return COMPLETENESS.RECOVERY_REQUIRED;
  if (value === COMPLETENESS.SESSION) return COMPLETENESS.SESSION;
  if (value === COMPLETENESS.RECOVERY_REQUIRED) return COMPLETENESS.RECOVERY_REQUIRED;
  return COMPLETENESS.RECOVERY_REQUIRED;
}

function applyFrame(view, raw) {
  var next = cloneView(view);
  if (!raw || typeof raw !== 'object') return next;
  if (raw.channel && raw.channel !== CHANNEL) return next;
  if (raw.channel !== CHANNEL) return next;

  next.lastType = typeof raw.type === 'string' ? raw.type : next.lastType;
  next.replayDurable = false;

  if (raw.type === 'ready' || raw.type === 'snapshot' || raw.type === 'status') {
    if (typeof raw.bus === 'boolean') next.bus = raw.bus;
    if (typeof raw.lastSeq === 'number' && Number.isInteger(raw.lastSeq) && raw.lastSeq >= 0) {
      next.lastSeq = raw.lastSeq;
    }
    if (raw.type === 'status' && typeof raw.code === 'string' && raw.code) {
      next.lastCode = raw.code;
    }
    if (raw.type === 'snapshot') {
      var list = Array.isArray(raw.executions) ? raw.executions : [];
      var execs = [];
      var seen = Object.create(null);
      for (var i = 0; i < list.length; i += 1) {
        var row = normalizeExecution(list[i]);
        if (!row || seen[row.fillId]) continue;
        seen[row.fillId] = true;
        execs.push(row);
      }
      next.executions = execs;
    }
    next.completeness = honestCompleteness(raw, next.executions);
    if (inventedCompleteEmpty(raw, next.executions)) {
      next.lastCode = RECOVERY_CODE;
    } else if (raw.type !== 'status' && next.executions.length === 0 && next.completeness === COMPLETENESS.RECOVERY_REQUIRED && !next.lastCode) {
      next.lastCode = RECOVERY_CODE;
    }
    return next;
  }

  if (raw.type === 'execution') {
    var exec = normalizeExecution(raw);
    if (!exec) return next;
    for (var j = 0; j < next.executions.length; j += 1) {
      if (next.executions[j].fillId === exec.fillId) return next;
    }
    next.executions = next.executions.concat([exec]);
    if (typeof exec.dropCopySeq === 'number') next.lastSeq = exec.dropCopySeq;
    if (next.completeness !== COMPLETENESS.COMMON_UPSTREAM_FAILURE) {
      next.completeness = COMPLETENESS.SESSION;
    }
    return next;
  }

  return next;
}

function applyDisconnect(view) {
  var next = cloneView(view);
  next.socket = 'closed';
  next.replayDurable = false;
  next.completeness = COMPLETENESS.RECOVERY_REQUIRED;
  next.lastCode = RECOVERY_CODE;
  return next;
}

function dropCopyStreamUrl(accessToken) {
  var proto = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:';
  var host = typeof location !== 'undefined' ? location.host : 'localhost';
  var token = accessToken == null ? '' : String(accessToken);
  return proto + '//' + host + '/ws/drop-copy/stream?access_token=' + encodeURIComponent(token);
}

function defaultSchedule(fn, delayMs) {
  var timer = setTimeout(fn, Math.max(0, delayMs));
  return function () {
    clearTimeout(timer);
  };
}

/**
 * Live drop-copy socket. Inbound evidence only — never sends.
 * On reconnect, the server watermarks incompleteness; this client does not
 * invent a durable tape from the previous session ring.
 */
function createDropCopyStream(opts) {
  var options = opts || {};
  var token = options.accessToken;
  var onView = options.onView;
  var onStatus = options.onStatus;
  var WS = options.WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  var schedule = options.schedule || defaultSchedule;

  var socket = null;
  var closed = false;
  var view = emptyView();
  var reconnectTimer = null;

  function publish() {
    if (typeof onView === 'function') onView(cloneView(view));
  }
  function status(s) {
    if (typeof onStatus === 'function') onStatus(s);
  }
  function applyAndPublish(raw) {
    view = applyFrame(view, raw);
    publish();
  }

  function onMessage(ev) {
    var msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (e) {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.channel === 'orders' || msg.channel === 'fills') return;
    applyAndPublish(msg);
  }

  function connect() {
    if (!WS || !token || closed) {
      view.socket = 'closed';
      publish();
      status('no-ws');
      return;
    }
    try {
      socket = new WS(dropCopyStreamUrl(token));
    } catch (e) {
      view.socket = 'closed';
      publish();
      status('ws-construct-failed');
      return;
    }
    socket.onopen = function () {
      if (closed) return;
      view.socket = 'open';
      publish();
      status('open');
    };
    socket.onmessage = onMessage;
    socket.onerror = function () {
      status('error');
    };
    socket.onclose = function () {
      socket = null;
      view = applyDisconnect(view);
      publish();
      status('closed');
      if (!closed) {
        reconnectTimer = schedule(function () {
          reconnectTimer = null;
          if (!closed && !socket) connect();
        }, 2000);
      }
    };
  }

  connect();

  return {
    stop: function () {
      closed = true;
      if (reconnectTimer) {
        reconnectTimer();
        reconnectTimer = null;
      }
      if (socket) {
        try {
          socket.close();
        } catch (e) {
          /* ignore */
        }
        socket = null;
      }
      view = emptyView();
      publish();
    },
    _view: function () {
      return cloneView(view);
    },
    _apply: function (msg) {
      applyAndPublish(msg);
    },
    _close: function () {
      if (socket && typeof socket.onclose === 'function') socket.onclose({});
    }
  };
}

module.exports = {
  CHANNEL: CHANNEL,
  COMPLETENESS: COMPLETENESS,
  RECOVERY_CODE: RECOVERY_CODE,
  UPSTREAM_CODE: UPSTREAM_CODE,
  GAP_CODE: GAP_CODE,
  emptyView: emptyView,
  cloneView: cloneView,
  normalizeExecution: normalizeExecution,
  inventedCompleteEmpty: inventedCompleteEmpty,
  applyFrame: applyFrame,
  applyDisconnect: applyDisconnect,
  dropCopyStreamUrl: dropCopyStreamUrl,
  createDropCopyStream: createDropCopyStream
};
