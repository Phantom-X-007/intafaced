'use strict';

var fixed = require('../fixed-decimal.js');

function clampCursor(total, fromEnd) {
  if (!total) return 0;
  var cursor = typeof fromEnd === 'number' && isFinite(fromEnd) ? Math.floor(fromEnd) : 0;
  return Math.max(0, Math.min(total - 1, cursor));
}

/** Exact, renderer-independent candle description for non-canvas users. */
function snapshot(bars, fromEnd) {
  var rows = Array.isArray(bars) ? bars : [];
  if (!rows.length) return null;
  var cursor = clampCursor(rows.length, fromEnd);
  var row = rows[rows.length - 1 - cursor];
  if (!row || !fixed.isFixed(row.open) || !fixed.isFixed(row.high) || !fixed.isFixed(row.low) || !fixed.isFixed(row.close)) return null;
  return Object.freeze({
    index: rows.length - cursor,
    total: rows.length,
    fromEnd: cursor,
    time: row.time,
    open: fixed.toString(row.open),
    high: fixed.toString(row.high),
    low: fixed.toString(row.low),
    close: fixed.toString(row.close)
  });
}

module.exports = { clampCursor: clampCursor, snapshot: snapshot };
