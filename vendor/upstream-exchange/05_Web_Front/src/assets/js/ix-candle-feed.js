/**
 * Real-time chart input from svc-ws' public TradePrint channel.
 *
 * The gateway does not implement the advertised `ohlcv` subscription. It does
 * implement `/ws/stream?market=<id>&channel=trades`, so the chart advances its
 * active bucket from those real prints. A reconnect is fenced by an
 * authoritative REST OHLCV refresh; frames received during that refresh wait
 * in memory and are applied only after it settles.
 */
'use strict';

var fixed = require('./fixed-decimal.js');
var DECIMAL = /^\d+(\.\d{1,18})?$/;
var MAX_BUFFERED = 500;

function streamUrl(marketId) {
  var proto = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:';
  var host = typeof location !== 'undefined' ? location.host : 'localhost';
  return proto + '//' + host + '/ws/stream?market=' + encodeURIComponent(marketId) + '&channel=trades';
}

function acceptTrade(value, marketId) {
  if (!value || value.type !== 'trade' || value.marketId !== marketId) return null;
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 0) return null;
  if (typeof value.price !== 'string' || !DECIMAL.test(value.price)) return null;
  if (typeof value.quantity !== 'string' || !DECIMAL.test(value.quantity)) return null;
  if (typeof value.ts !== 'string' || !Number.isFinite(Date.parse(value.ts))) return null;
  return value;
}

function barFromTrade(last, print, bucketSeconds) {
  var millis = print && Date.parse(print.ts);
  var price = print && fixed.parse(print.price);
  var quantity = print && fixed.parse(print.quantity);
  if (!Number.isSafeInteger(bucketSeconds) || bucketSeconds <= 0 || !isFinite(millis) || !price || !quantity) return null;
  var bucket = Math.floor(millis / 1000 / bucketSeconds) * bucketSeconds;
  if (last && bucket < last.time) return null;
  if (!last || bucket > last.time) {
    return { time: bucket, open: price, high: price, low: price, close: price, volume: quantity };
  }
  return {
    time: bucket,
    open: last.open,
    high: fixed.compare(last.high, price) >= 0 ? last.high : price,
    low: fixed.compare(last.low, price) <= 0 ? last.low : price,
    close: price,
    volume: last.volume ? fixed.add(last.volume, quantity) : quantity
  };
}

function createTradeCandleFeed(opts) {
  var marketId = opts && opts.marketId;
  var WS = (opts && opts.WebSocketImpl) || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  var schedule = (opts && opts.setTimeoutImpl) || setTimeout;
  var cancel = (opts && opts.clearTimeoutImpl) || clearTimeout;
  var onTrade = opts && opts.onTrade;
  var onStatus = opts && opts.onStatus;
  var onReconnect = opts && opts.onReconnect;
  var socket = null;
  var timer = null;
  var stopped = false;
  var connections = 0;
  var retry = 0;
  var refreshing = false;
  var queued = [];
  var seen = Object.create(null);
  var seenOrder = [];

  function status(value) {
    if (typeof onStatus === 'function') onStatus(value);
  }

  function deliver(print) {
    var key = print.sequence + '|' + print.ts + '|' + print.price + '|' + print.quantity;
    if (seen[key]) return;
    seen[key] = true;
    seenOrder.push(key);
    while (seenOrder.length > MAX_BUFFERED) delete seen[seenOrder.shift()];
    if (typeof onTrade === 'function') onTrade(print);
    status('live');
  }

  function flush() {
    var pending = queued;
    queued = [];
    for (var i = 0; i < pending.length; i++) deliver(pending[i]);
  }

  function message(event) {
    var parsed;
    try {
      parsed = JSON.parse(event.data);
    } catch (error) {
      return;
    }
    var print = acceptTrade(parsed, marketId);
    if (!print) return;
    if (refreshing) {
      if (queued.length < MAX_BUFFERED) queued.push(print);
      return;
    }
    deliver(print);
  }

  function connect() {
    if (stopped || !WS || !marketId) {
      status('unavailable');
      return;
    }
    status(connections ? 'reconnecting' : 'connecting');
    try {
      socket = new WS(streamUrl(marketId));
    } catch (error) {
      socket = null;
      scheduleReconnect();
      return;
    }
    socket.onmessage = message;
    socket.onerror = function () { status('interrupted'); };
    socket.onopen = function () {
      if (stopped) return;
      var reconnecting = connections > 0;
      connections += 1;
      retry = 0;
      if (!reconnecting || typeof onReconnect !== 'function') {
        status('listening');
        return;
      }
      refreshing = true;
      status('resyncing');
      Promise.resolve().then(onReconnect).catch(function () {
        /* The history loader reports its own typed failure. Buffered real
           prints may still restore a current candle after the fence opens. */
      }).then(function () {
        if (stopped) return;
        refreshing = false;
        status('listening');
        flush();
      });
    };
    socket.onclose = function () {
      socket = null;
      if (stopped) return;
      status('reconnecting');
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (stopped || timer) return;
    retry += 1;
    var delay = Math.min(1000 * Math.pow(2, retry - 1), 15000);
    timer = schedule(function () {
      timer = null;
      connect();
    }, delay);
  }

  connect();
  return {
    stop: function () {
      stopped = true;
      queued = [];
      if (timer) cancel(timer);
      timer = null;
      if (socket) {
        try { socket.close(); } catch (error) { /* already closed */ }
      }
      socket = null;
      status('closed');
    }
  };
}

module.exports = {
  acceptTrade: acceptTrade,
  barFromTrade: barFromTrade,
  streamUrl: streamUrl,
  createTradeCandleFeed: createTradeCandleFeed
};
