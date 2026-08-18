/**
 * Kline OHLCV accept — refuse JSON-number candles before chart parseFloat.
 *
 * Chart pixels need numbers; the wire must carry decimal STRINGS for open/
 * high/low/close (same law as ix-wire.candle). Numbers are skipped, not
 * laundered. CommonJS for goldens.
 */
'use strict';

/**
 * @param {*} item wire row [ts, o, h, l, c, v?]
 * @returns {{time:number, open:number, high:number, low:number, close:number}|null}
 */
function barFromWireRow(item) {
  if (!item || item.length < 5) return null;
  if (
    typeof item[1] !== 'string' ||
    typeof item[2] !== 'string' ||
    typeof item[3] !== 'string' ||
    typeof item[4] !== 'string'
  ) {
    return null;
  }
  var t = item[0];
  if (typeof t === 'string' && t.trim() !== '') t = Number(t);
  if (typeof t !== 'number' || !isFinite(t)) return null;
  if (t > 1e12) t = Math.floor(t / 1000);
  var o = parseFloat(item[1]);
  var h = parseFloat(item[2]);
  var l = parseFloat(item[3]);
  var c = parseFloat(item[4]);
  if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) return null;
  return { time: t, open: o, high: h, low: l, close: c };
}

/**
 * @param {Array} data
 * @returns {Array}
 */
function barsFromHistory(data) {
  var rows = Array.isArray(data) ? data : [];
  var bars = [];
  for (var i = 0; i < rows.length; i++) {
    var bar = barFromWireRow(rows[i]);
    if (bar) bars.push(bar);
  }
  bars.sort(function (a, b) {
    return a.time - b.time;
  });
  var deduped = [];
  var lastT = -1;
  for (var j = 0; j < bars.length; j++) {
    if (bars[j].time === lastT) continue;
    deduped.push(bars[j]);
    lastT = bars[j].time;
  }
  return deduped;
}

module.exports = {
  barFromWireRow: barFromWireRow,
  barsFromHistory: barsFromHistory
};
