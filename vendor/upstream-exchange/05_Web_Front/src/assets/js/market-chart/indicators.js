/**
 * Pure desk indicators. Input is the already wire-gated candle bars produced by
 * kline-ohlcv.js; this module never fetches, fills gaps, or fabricates candles.
 *
 * RSI uses Wilder's smoothing. MACD uses SMA-seeded EMAs (12, 26, 9).
 * CommonJS keeps the math executable as a deterministic golden without a DOM.
 */
'use strict';

function validBars(input) {
  if (!Array.isArray(input)) return [];
  return input.filter(function (bar) {
    return (
      bar &&
      (typeof bar.time === 'number' || typeof bar.time === 'string') &&
      typeof bar.close === 'number' &&
      isFinite(bar.close)
    );
  });
}

function rsi(input, period) {
  var bars = validBars(input);
  var p = Number(period || 14);
  if (!isFinite(p) || p < 2) p = 14;
  p = Math.floor(p);
  if (bars.length <= p) return [];

  var gain = 0;
  var loss = 0;
  for (var i = 1; i <= p; i++) {
    var firstDelta = bars[i].close - bars[i - 1].close;
    if (firstDelta > 0) gain += firstDelta;
    else loss -= firstDelta;
  }

  var avgGain = gain / p;
  var avgLoss = loss / p;
  var out = [{ time: bars[p].time, value: rsiValue(avgGain, avgLoss) }];

  for (var j = p + 1; j < bars.length; j++) {
    var delta = bars[j].close - bars[j - 1].close;
    var nextGain = delta > 0 ? delta : 0;
    var nextLoss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (p - 1) + nextGain) / p;
    avgLoss = (avgLoss * (p - 1) + nextLoss) / p;
    out.push({ time: bars[j].time, value: rsiValue(avgGain, avgLoss) });
  }
  return out;
}

function rsiValue(avgGain, avgLoss) {
  if (avgGain === 0 && avgLoss === 0) return 50;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/**
 * EMA points seeded with the simple average at period - 1. Empty entries before
 * the seed are null so consumers cannot mistake warm-up for a zero indicator.
 */
function ema(values, period) {
  var out = new Array(values.length);
  if (values.length < period) return out;
  var sum = 0;
  for (var i = 0; i < period; i++) sum += values[i];
  var previous = sum / period;
  out[period - 1] = previous;
  var multiplier = 2 / (period + 1);
  for (var j = period; j < values.length; j++) {
    previous = (values[j] - previous) * multiplier + previous;
    out[j] = previous;
  }
  return out;
}

function macd(input, fastPeriod, slowPeriod, signalPeriod) {
  var bars = validBars(input);
  var fast = Number(fastPeriod || 12);
  var slow = Number(slowPeriod || 26);
  var signal = Number(signalPeriod || 9);
  if (!isFinite(fast) || fast < 2) fast = 12;
  if (!isFinite(slow) || slow <= fast) slow = 26;
  if (!isFinite(signal) || signal < 2) signal = 9;
  fast = Math.floor(fast);
  slow = Math.floor(slow);
  signal = Math.floor(signal);
  if (bars.length < slow + signal - 1) return [];

  var closes = bars.map(function (bar) {
    return bar.close;
  });
  var fastEma = ema(closes, fast);
  var slowEma = ema(closes, slow);
  var macdValues = [];
  var macdIndexes = [];
  for (var i = slow - 1; i < bars.length; i++) {
    macdValues.push(fastEma[i] - slowEma[i]);
    macdIndexes.push(i);
  }
  var signalEma = ema(macdValues, signal);
  var out = [];
  for (var j = signal - 1; j < macdValues.length; j++) {
    var index = macdIndexes[j];
    out.push({
      time: bars[index].time,
      macd: macdValues[j],
      signal: signalEma[j],
      histogram: macdValues[j] - signalEma[j]
    });
  }
  return out;
}

module.exports = {
  rsi: rsi,
  macd: macd,
  ema: ema
};
