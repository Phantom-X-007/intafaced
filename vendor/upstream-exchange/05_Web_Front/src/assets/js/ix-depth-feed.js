/**
 * Live depth feed — svc-ws public stream, same-origin via nginx `/ws/`.
 *
 * Protocol (packages/market-data depth messages):
 *   snapshot { type, marketId, sequence, bids:[[p,q],...], asks:[[p,q],...] }
 *   delta    { type, marketId, fromSequence, sequence, bids, asks }
 *             qty "0" removes a level
 *
 * Gap → caller resnapshots REST WITHOUT tearing down the socket.
 * Empty book (sequence 0, empty sides) is success, not an error.
 *
 * CommonJS for golden tests + webpack require, matching ix-trade.js.
 */
'use strict';

function emptyBook(marketId) {
  return { marketId: marketId, sequence: -1, bids: Object.create(null), asks: Object.create(null) };
}

function sideFromWire(levels) {
  var side = Object.create(null);
  if (!Array.isArray(levels)) return side;
  for (var i = 0; i < levels.length; i++) {
    var row = levels[i];
    if (!row || row.length < 2) continue;
    var price = String(row[0]);
    var qty = String(row[1]);
    if (!price || qty === '0' || qty === '0.0' || qty === '0.00') continue;
    /* Reject non-positive quantity without inventing. */
    if (qty.charAt(0) === '-') continue;
    side[price] = qty;
  }
  return side;
}

function bookFromSnapshot(snapshot) {
  return {
    marketId: snapshot.marketId,
    sequence: Number(snapshot.sequence),
    bids: sideFromWire(snapshot.bids),
    asks: sideFromWire(snapshot.asks)
  };
}

function applySide(current, levels) {
  var next = Object.create(null);
  var k;
  for (k in current) {
    if (Object.prototype.hasOwnProperty.call(current, k)) next[k] = current[k];
  }
  if (!Array.isArray(levels)) return next;
  for (var i = 0; i < levels.length; i++) {
    var row = levels[i];
    if (!row || row.length < 2) continue;
    var price = String(row[0]);
    var qty = String(row[1]);
    if (qty === '0' || qty === '0.0' || qty === '0.00') {
      delete next[price];
    } else if (qty.charAt(0) !== '-') {
      next[price] = qty;
    }
  }
  return next;
}

/**
 * @returns {{ ok: true, book: object } | { ok: false, reason: string, expected?: *, got?: * }}
 */
function applyDelta(book, delta) {
  if (!book || !delta) return { ok: false, reason: 'missing' };
  if (delta.marketId !== book.marketId) {
    return { ok: false, reason: 'wrong-market', expected: book.marketId, got: delta.marketId };
  }
  var seq = Number(delta.sequence);
  var from = Number(delta.fromSequence);
  if (seq <= book.sequence) {
    return { ok: false, reason: 'stale', expected: book.sequence + 1, got: seq };
  }
  if (from !== book.sequence) {
    return { ok: false, reason: 'gap', expected: book.sequence, got: from };
  }
  return {
    ok: true,
    book: {
      marketId: book.marketId,
      sequence: seq,
      bids: applySide(book.bids, delta.bids),
      asks: applySide(book.asks, delta.asks)
    }
  };
}

/** Map side → [[price, qty], ...] for toPlateItems / applyPlate. */
function levelsFromSide(side, sortDir) {
  var keys = Object.keys(side || {});
  keys.sort(function (a, b) {
    /* Lexicographic fails for numbers; compare as decimals via Number only for order —
       quantities stay strings. Sort keys numerically for ladder order. */
    var na = parseFloat(a);
    var nb = parseFloat(b);
    if (isNaN(na) || isNaN(nb)) return a < b ? -1 : a > b ? 1 : 0;
    return sortDir === 'asc' ? na - nb : nb - na;
  });
  var out = [];
  for (var i = 0; i < keys.length; i++) {
    out.push([keys[i], side[keys[i]]]);
  }
  return out;
}

function platePayload(book) {
  return {
    bids: levelsFromSide(book.bids, 'desc'),
    asks: levelsFromSide(book.asks, 'asc'),
    sequence: book.sequence
  };
}

function streamUrl(marketId) {
  var proto = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:';
  var host = typeof location !== 'undefined' ? location.host : 'localhost';
  return proto + '//' + host + '/ws/stream?market=' + encodeURIComponent(marketId);
}

function resnapshotUrl(marketId) {
  return '/ws/markets/' + encodeURIComponent(marketId) + '/depth';
}

/**
 * @param {object} opts
 * @param {string} opts.marketId  UUID from GET /markets id field
 * @param {function(object)} opts.onBook  plate payload { bids, asks, sequence }
 * @param {function(boolean)} opts.onLive feedLive flag
 * @param {function(string)=} opts.onStatus optional status for diagnostics
 * @param {typeof fetch=} opts.fetchImpl
 * @param {typeof WebSocket=} opts.WebSocketImpl
 */
function createDepthFeed(opts) {
  var marketId = opts && opts.marketId;
  var onBook = opts && opts.onBook;
  var onLive = opts && opts.onLive;
  var onStatus = opts && opts.onStatus;
  var fetchImpl = (opts && opts.fetchImpl) || (typeof fetch !== 'undefined' ? fetch : null);
  var WS = (opts && opts.WebSocketImpl) || (typeof WebSocket !== 'undefined' ? WebSocket : null);

  var socket = null;
  var book = emptyBook(marketId || '');
  var closed = false;
  var resnapshotInFlight = false;

  function setLive(v) {
    if (typeof onLive === 'function') onLive(!!v);
  }
  function status(s) {
    if (typeof onStatus === 'function') onStatus(s);
  }
  function publish() {
    if (typeof onBook === 'function') onBook(platePayload(book));
  }

  function applySnapshotMsg(msg) {
    book = bookFromSnapshot(msg);
    publish();
  }

  function resnapshot() {
    if (!fetchImpl || !marketId || resnapshotInFlight || closed) return;
    resnapshotInFlight = true;
    status('resnapshot');
    fetchImpl(resnapshotUrl(marketId), { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('depth HTTP ' + res.status);
        return res.json();
      })
      .then(function (body) {
        if (closed) return;
        /* REST returns snapshot-shaped body (type optional). */
        var snap = {
          type: 'snapshot',
          marketId: body.marketId || marketId,
          sequence: body.sequence,
          bids: body.bids || [],
          asks: body.asks || []
        };
        applySnapshotMsg(snap);
        status('live');
      })
      .catch(function () {
        status('resnapshot-failed');
      })
      .then(function () {
        resnapshotInFlight = false;
      });
  }

  function onMessage(ev) {
    var msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (e) {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'snapshot') {
      applySnapshotMsg(msg);
      return;
    }
    if (msg.type === 'delta') {
      var result = applyDelta(book, msg);
      if (result.ok) {
        book = result.book;
        publish();
        return;
      }
      if (result.reason === 'stale') return;
      if (result.reason === 'gap' || result.reason === 'wrong-market') {
        resnapshot();
      }
    }
  }

  function connect() {
    if (!WS || !marketId || closed) {
      setLive(false);
      status('no-ws');
      return;
    }
    try {
      socket = new WS(streamUrl(marketId));
    } catch (e) {
      setLive(false);
      status('ws-construct-failed');
      return;
    }
    socket.onopen = function () {
      if (closed) return;
      setLive(true);
      status('open');
    };
    socket.onmessage = onMessage;
    socket.onerror = function () {
      status('error');
    };
    socket.onclose = function () {
      setLive(false);
      status('closed');
      socket = null;
      if (!closed) {
        /* One delayed reconnect — empty book remains honest until then. */
        setTimeout(function () {
          if (!closed && !socket) connect();
        }, 2000);
      }
    };
  }

  connect();

  return {
    stop: function () {
      closed = true;
      setLive(false);
      if (socket) {
        try {
          socket.close();
        } catch (e) {
          /* ignore */
        }
        socket = null;
      }
    },
    resnapshot: resnapshot,
    /** @private test helpers */
    _book: function () {
      return book;
    },
    _apply: function (msg) {
      if (msg.type === 'snapshot') applySnapshotMsg(msg);
      else if (msg.type === 'delta') {
        var r = applyDelta(book, msg);
        if (r.ok) book = r.book;
        return r;
      }
    }
  };
}

module.exports = {
  emptyBook: emptyBook,
  bookFromSnapshot: bookFromSnapshot,
  applyDelta: applyDelta,
  platePayload: platePayload,
  levelsFromSide: levelsFromSide,
  streamUrl: streamUrl,
  resnapshotUrl: resnapshotUrl,
  createDepthFeed: createDepthFeed
};
