/** Run from 05_Web_Front: node src/assets/js/market-chart/indicators.golden.js */
'use strict';

var indicators = require('./indicators.js');
var failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error('FAIL:', message);
  } else {
    console.log('ok:', message);
  }
}

function near(actual, expected, epsilon, message) {
  assert(Math.abs(actual - expected) <= epsilon, message + ' (' + actual + ')');
}

function barsFromCloses(closes) {
  return closes.map(function (close, index) {
    return { time: index + 1, open: close, high: close, low: close, close: close };
  });
}

/* Wilder's published-style worksheet sample. The first 14-period result is
   independently known as 70.464135...; warm-up must remain absent, never 0. */
var wilder = barsFromCloses([
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42,
  45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0
]);
var rsi = indicators.rsi(wilder, 14);
assert(rsi.length === 2, 'RSI emits only after the 14-candle warm-up');
assert(rsi[0].time === 15, 'RSI keeps the source candle time');
near(rsi[0].value, 70.4641350211, 1e-9, 'RSI Wilder first value');
near(rsi[1].value, 66.2496185536, 1e-9, 'RSI Wilder smoothing value');

var flat = indicators.rsi(barsFromCloses(new Array(16).fill(10)), 14);
assert(flat[0].value === 50, 'flat RSI is neutral, not divide-by-zero or 0');

/* A linear close sequence makes both SMA-seeded EMAs trail by a constant.
   MACD(12,26) is exactly 7 and signal(9) is exactly 7 after warm-up. */
var rising = [];
for (var i = 1; i <= 40; i++) rising.push(i);
var macd = indicators.macd(barsFromCloses(rising), 12, 26, 9);
assert(macd.length === 7, 'MACD emits only after slow and signal warm-up');
assert(macd[0].time === 34, 'MACD keeps the source candle time');
near(macd[0].macd, 7, 1e-12, 'MACD line golden');
near(macd[0].signal, 7, 1e-12, 'MACD signal golden');
near(macd[0].histogram, 0, 1e-12, 'MACD histogram golden');

assert(indicators.rsi([{ time: 1, close: '10' }], 14).length === 0, 'string chart closes refused');
assert(indicators.macd([], 12, 26, 9).length === 0, 'empty candles stay empty');

if (failed) {
  console.error('\n' + failed + ' indicator golden assertion(s) failed');
  process.exit(1);
}
console.log('\nmarket-chart indicators golden: all passed');
