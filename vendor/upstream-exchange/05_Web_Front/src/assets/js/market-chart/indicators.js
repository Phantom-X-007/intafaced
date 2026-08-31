/**
 * Exact desk indicators over scaled-bigint candle state.
 *
 * RSI uses Wilder smoothing and MACD uses SMA-seeded EMAs. Divisions retain
 * eighteen guard decimal places beyond the most precise input, with one named,
 * deterministic half-away-from-zero rule. No IEEE-754 price enters this file.
 */
'use strict';

var fixed = require('../fixed-decimal.js');
var GUARD_DIGITS = 18;

function periodOr(value, fallback, minimum) {
  if (typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= minimum) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    var parsed = parseInt(value, 10);
    if (isFinite(parsed) && parsed >= minimum) return parsed;
  }
  return fallback;
}

function validBars(input) {
  if (!Array.isArray(input)) return [];
  return input.filter(function (bar) {
    return bar && (typeof bar.time === 'number' || typeof bar.time === 'string') && fixed.isFixed(bar.close);
  });
}

function calculationScale(values) {
  var scale = 0;
  for (var i = 0; i < values.length; i++) {
    if (fixed.isFixed(values[i])) scale = Math.max(scale, values[i].scale);
  }
  return Math.min(100, scale + GUARD_DIGITS);
}

function zero() { return fixed.parse('0'); }

function ema(values, period) {
  var p = periodOr(period, 14, 2);
  var accepted = Array.isArray(values) ? values.filter(fixed.isFixed) : [];
  var out = new Array(accepted.length);
  if (accepted.length < p) return out;
  var scale = calculationScale(accepted);
  var sum = zero();
  for (var i = 0; i < p; i++) sum = fixed.add(sum, accepted[i]);
  var previous = fixed.divideInteger(sum, p, scale);
  out[p - 1] = previous;
  for (var j = p; j < accepted.length; j++) {
    var delta = fixed.subtract(accepted[j], previous);
    var adjustment = fixed.divideInteger(fixed.multiplyInteger(delta, 2), p + 1, scale);
    previous = fixed.add(previous, adjustment);
    out[j] = previous;
  }
  return out;
}

function rsiValue(avgGain, avgLoss, scale) {
  var gainIsZero = fixed.compare(avgGain, zero()) === 0;
  var lossIsZero = fixed.compare(avgLoss, zero()) === 0;
  if (gainIsZero && lossIsZero) return fixed.parse('50');
  if (lossIsZero) return fixed.parse('100');
  if (gainIsZero) return zero();
  return fixed.ratioPercent(avgGain, fixed.add(avgGain, avgLoss), scale);
}

function rsi(input, period) {
  var bars = validBars(input);
  var p = periodOr(period, 14, 2);
  if (bars.length <= p) return [];
  var closes = bars.map(function (bar) { return bar.close; });
  var scale = calculationScale(closes);
  var gain = zero();
  var loss = zero();
  for (var i = 1; i <= p; i++) {
    var delta = fixed.subtract(bars[i].close, bars[i - 1].close);
    if (fixed.compare(delta, zero()) > 0) gain = fixed.add(gain, delta);
    else loss = fixed.add(loss, fixed.negate(delta));
  }
  var avgGain = fixed.divideInteger(gain, p, scale);
  var avgLoss = fixed.divideInteger(loss, p, scale);
  var out = [{ time: bars[p].time, value: rsiValue(avgGain, avgLoss, scale) }];
  for (var j = p + 1; j < bars.length; j++) {
    var nextDelta = fixed.subtract(bars[j].close, bars[j - 1].close);
    var nextGain = fixed.compare(nextDelta, zero()) > 0 ? nextDelta : zero();
    var nextLoss = fixed.compare(nextDelta, zero()) < 0 ? fixed.negate(nextDelta) : zero();
    avgGain = fixed.divideInteger(fixed.add(fixed.multiplyInteger(avgGain, p - 1), nextGain), p, scale);
    avgLoss = fixed.divideInteger(fixed.add(fixed.multiplyInteger(avgLoss, p - 1), nextLoss), p, scale);
    out.push({ time: bars[j].time, value: rsiValue(avgGain, avgLoss, scale) });
  }
  return out;
}

function macd(input, fastPeriod, slowPeriod, signalPeriod) {
  var bars = validBars(input);
  var fast = periodOr(fastPeriod, 12, 2);
  var slow = periodOr(slowPeriod, 26, fast + 1);
  var signal = periodOr(signalPeriod, 9, 2);
  if (slow <= fast) slow = 26;
  if (bars.length < slow + signal - 1) return [];
  var closes = bars.map(function (bar) { return bar.close; });
  var fastEma = ema(closes, fast);
  var slowEma = ema(closes, slow);
  var macdValues = [];
  var macdIndexes = [];
  for (var i = slow - 1; i < bars.length; i++) {
    macdValues.push(fixed.subtract(fastEma[i], slowEma[i]));
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
      histogram: fixed.subtract(macdValues[j], signalEma[j])
    });
  }
  return out;
}

module.exports = { rsi: rsi, macd: macd, ema: ema };
