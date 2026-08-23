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
 * HONESTY — feedLive is NOT "WebSocket TCP open".
 * onLive(true) only after a valid depth snapshot for this marketId has been
 * applied (WS snapshot or REST resnapshot). A socket that is open but silent
 * must stay not-live so the desk never paints "Live" over a cold book.
 *
 * CommonJS for golden tests + webpack require, matching ix-trade.js.
 */
'use strict';

function emptyBook(marketId) {
  return { marketId: marketId, sequence: -1, bids: Object.create(null), asks: Object.create(null) };
}

/**
 * Ladder order without IEEE. Lexicographic "9" > "10"; parseFloat("9") is a
 * price-as-Number. Digit-length then lexicographic on the stripped parts.
 * Unreadable strings fall through to < so a bad key never becomes 0.
 */
function compareDecimalStrings(a, b) {
  function parts(s) {
    s = String(s == null ? '' : s).trim();
    var neg = false;
    if (s.charAt(0) === '+') s = s.slice(1);
    if (s.charAt(0) === '-') {
      neg = true;
      s = s.slice(1);
    }
    if (!s || /[^0-9.]/.test(s) || (s.split('.').length > 2)) {
      return null;
    }
    var dot = s.indexOf('.');
    var whole = dot < 0 ? s : s.slice(0, dot);
    var frac = dot < 0 ? '' : s.slice(dot + 1);
    whole = whole.replace(/^0+/, '');
    frac = frac.replace(/0+$/, '');
    if (!whole) whole = '0';
    if (neg && whole === '0' && !frac) neg = false;
    return { neg: neg, whole: whole, frac: frac };
  }
  var pa = parts(a);
  var pb = parts(b);
  if (pa === null || pb === null) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  if (pa.neg !== pb.neg) return pa.neg ? -1 : 1;
  var sign = pa.neg ? -1 : 1;
  if (pa.whole.length !== pb.whole.length) {
    return (pa.whole.length < pb.whole.length ? -1 : 1) * sign;
  }
  if (pa.whole !== pb.whole) {
    return (pa.whole < pb.whole ? -1 : 1) * sign;
  }
  var n = pa.frac.length > pb.frac.length ? pa.frac.length : pb.frac.length;
  var fa = pa.frac;
  var fb = pb.frac;
  while (fa.length < n) fa += '0';
  while (fb.length < n) fb += '0';
  if (fa === fb) return 0;
  return (fa < fb ? -1 : 1) * sign;
}

function sideFromWire(levels) {
  var side = Object.create(null);
  if (!Array.isArray(levels)) return side;
  for (var i = 0; i < levels.length; i++) {
    var row = levels[i];
    if (!row || row.length < 2) continue;
    /* JSON numbers are not venue decimals — String(42.5) invents a print path.
       Same law as ix-wire.decimal / REST accept: refuse, do not coerce. */
    if (typeof row[0] !== 'string' || typeof row[1] !== 'string') continue;
    var price = row[0].trim();
    var qty = row[1].trim();
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
    /* Same refuse as sideFromWire: JSON numbers never enter the book. */
    if (typeof row[0] !== 'string' || typeof row[1] !== 'string') continue;
    var price = row[0].trim();
    var qty = row[1].trim();
    if (!price) continue;
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
    var c = compareDecimalStrings(a, b);
    if (c === 0) return 0;
    return sortDir === 'asc' ? c : -c;
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
    /* First honest live edge: we have venue depth data for this market. */
    setLive(true);
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
      /* TCP open alone is not live data — wait for snapshot. */
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
  compareDecimalStrings: compareDecimalStrings,
  streamUrl: streamUrl,
  resnapshotUrl: resnapshotUrl,
  createDepthFeed: createDepthFeed
};
