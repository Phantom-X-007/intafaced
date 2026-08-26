/**
 * Pure lightweight-charts adapter for desk studies.
 *
 * Keeping the plan separate from the browser widget makes pane placement,
 * instrument precision, and accepted-candle routing deterministic in Node
 * goldens. No wire row is accepted here; callers pass rows that have already
 * crossed kline-ohlcv's decimal-string gate.
 */
'use strict';

var indicators = require('./indicators.js');

function instrumentPriceFormat(priceScale) {
  if (!priceScale || !isFinite(priceScale) || priceScale < 1) return null;
  var precision = Math.max(0, Math.round(Math.log(priceScale) / Math.LN10));
  return { type: 'price', precision: precision, minMove: 1 / priceScale };
}

function withPriceFormat(options, priceFormat) {
  var out = Object.assign({}, options);
  if (priceFormat) out.priceFormat = priceFormat;
  return out;
}

function buildIndicatorPlan(visibility, priceScale) {
  var shown = visibility && typeof visibility === 'object' ? visibility : {};
  var plan = [];
  var paneIndex = 1;
  var macdFormat = instrumentPriceFormat(priceScale);

  if (shown.rsi !== false) {
    plan.push({
      id: 'rsi',
      kind: 'line',
      pane: paneIndex++,
      options: {
        title: 'RSI 14',
        color: '#f0b90b',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
      }
    });
  }

  if (shown.macd !== false) {
    plan.push({
      id: 'macdHistogram',
      kind: 'histogram',
      pane: paneIndex,
      options: withPriceFormat({
        title: 'MACD 12/26/9',
        priceLineVisible: false,
        lastValueVisible: false
      }, macdFormat)
    });
    plan.push({
      id: 'macd',
      kind: 'line',
      pane: paneIndex,
      options: withPriceFormat({
        title: 'MACD',
        color: '#58a6ff',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false
      }, macdFormat)
    });
    plan.push({
      id: 'macdSignal',
      kind: 'line',
      pane: paneIndex,
      options: withPriceFormat({
        title: 'Signal',
        color: '#f0b90b',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false
      }, macdFormat)
    });
  }
  return plan;
}

function mountIndicatorPlan(chart, lightweightCharts, plan) {
  var mounted = {};
  for (var i = 0; i < plan.length; i++) {
    var spec = plan[i];
    var ctor = spec.kind === 'histogram'
      ? lightweightCharts.HistogramSeries
      : lightweightCharts.LineSeries;
    mounted[spec.id] = chart.addSeries(ctor, spec.options, spec.pane);
  }
  return mounted;
}

function indicatorData(bars) {
  var accepted = Array.isArray(bars) ? bars : [];
  var rsiRows = indicators.rsi(accepted, 14);
  var macdRows = indicators.macd(accepted, 12, 26, 9);
  return {
    rsi: rsiRows,
    macd: macdRows.map(function (row) {
      return { time: row.time, value: row.macd };
    }),
    macdSignal: macdRows.map(function (row) {
      return { time: row.time, value: row.signal };
    }),
    macdHistogram: macdRows.map(function (row) {
      return {
        time: row.time,
        value: row.histogram,
        color: row.histogram >= 0 ? 'rgba(14,203,129,0.72)' : 'rgba(246,70,93,0.72)'
      };
    })
  };
}

module.exports = {
  instrumentPriceFormat: instrumentPriceFormat,
  buildIndicatorPlan: buildIndicatorPlan,
  mountIndicatorPlan: mountIndicatorPlan,
  indicatorData: indicatorData
};
