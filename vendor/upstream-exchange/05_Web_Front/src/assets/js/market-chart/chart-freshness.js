/** Exact request ordering + honest chart provenance helpers. */
'use strict';

function createLatestRequestFence() {
  var generation = 0;
  var disposed = false;
  return {
    begin: function () {
      generation += 1;
      return generation;
    },
    isCurrent: function (requestId) {
      return !disposed && requestId === generation;
    },
    dispose: function () {
      disposed = true;
      generation += 1;
    },
  };
}

function latestCandleTimeMs(bars) {
  var rows = Array.isArray(bars) ? bars : [];
  if (!rows.length) return null;
  var seconds = rows[rows.length - 1] && rows[rows.length - 1].time;
  if (typeof seconds !== 'number' || !isFinite(seconds)) return null;
  return Math.floor(seconds * 1000);
}

function snapshotState(status, bars) {
  return {
    status: status,
    source: 'svc-trade REST snapshot',
    live: false,
    latestCandleTimeMs: status === 'ok' ? latestCandleTimeMs(bars) : null,
  };
}

/** A silent socket after a print is stale, not live. Inject now in tests. */
var STALE_AFTER_MS = 15000;

function ageTransport(transport, nowMs, lastPrintMs, staleAfterMs) {
  if (transport !== 'live') return transport;
  if (typeof nowMs !== 'number' || !isFinite(nowMs) || typeof lastPrintMs !== 'number' || !isFinite(lastPrintMs)) {
    return transport;
  }
  var limit = typeof staleAfterMs === 'number' && staleAfterMs > 0 ? staleAfterMs : STALE_AFTER_MS;
  if (nowMs - lastPrintMs > limit) return 'stale';
  return 'live';
}

function streamState(status, bars, transport, nowMs, lastPrintMs, staleAfterMs) {
  var aged = ageTransport(transport, nowMs, lastPrintMs, staleAfterMs);
  return {
    status: status,
    source: 'svc-trade REST snapshot + svc-ws public trade stream',
    live: aged === 'live',
    transport: aged,
    latestCandleTimeMs: status === 'ok' ? latestCandleTimeMs(bars) : null,
  };
}

module.exports = {
  STALE_AFTER_MS: STALE_AFTER_MS,
  createLatestRequestFence: createLatestRequestFence,
  latestCandleTimeMs: latestCandleTimeMs,
  snapshotState: snapshotState,
  streamState: streamState,
  ageTransport: ageTransport,
};
