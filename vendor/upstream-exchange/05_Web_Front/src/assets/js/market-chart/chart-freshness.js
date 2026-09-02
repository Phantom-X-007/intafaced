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

function streamState(status, bars, transport) {
  return {
    status: status,
    source: 'svc-trade REST snapshot + svc-ws public trade stream',
    live: transport === 'live',
    transport: transport,
    latestCandleTimeMs: status === 'ok' ? latestCandleTimeMs(bars) : null,
  };
}

module.exports = {
  createLatestRequestFence: createLatestRequestFence,
  latestCandleTimeMs: latestCandleTimeMs,
  snapshotState: snapshotState,
  streamState: streamState,
};
