/* ============================================================================
   INTAFACED — lawful market chart (lightweight-charts, Apache-2.0)
   ----------------------------------------------------------------------------
   Replaces the unlicensed Charting Library that arrived with the vendored
   shell.

   HISTORY NOW COMES FROM `GET /api/v1/ohlcv/:symbol` on svc-trade, not from
   `/market/history` on the retired Java market service (ADR 2026-08-02).

   THE WIRE FORMAT DID NOT CHANGE, and that is worth stating: both surfaces
   publish `[timestampMs, open, high, low, close, volume]`, so this file swapped
   a URL and a query, not a parser.

   WHAT DID CHANGE IS THE MEANING OF "NO BARS". `_loadHistory` used to resolve
   the same value for an empty series and a failed request — the comment even
   said "empty frame is success" — so a chart whose data source was down looked
   exactly like a market that had never traded. Those are opposite facts. It now
   resolves one of three states and the desk renders a different sentence for
   each:

     'ok'      bars were returned and drawn
     'empty'   the venue answered, and this market has never traded
     'failed'  the venue did not answer, so we do not know

   Our candles are aggregated from the real taker fill tape. A bucket with no
   fills is absent rather than zero-filled, so a gap in the series is a genuine
   gap and never a fabricated print at price 0.
   ========================================================================== */

var $ = require('jquery');
var klineOhlcv = require('../kline-ohlcv.js');
var fixed = require('../fixed-decimal.js');
var chartAdapter = require('./chart-adapter.js');
var chartFreshness = require('./chart-freshness.js');
var chartAccessibility = require('./chart-accessibility.js');
var chartReprice = require('./chart-reprice.js');
/* Vendored Apache-2.0 v5 standalone build — see LICENSE/NOTICE.lightweight-charts */
require('./lightweight-charts.standalone.production.js');
var LightweightCharts = window.LightweightCharts;
var createChart = LightweightCharts.createChart;

var RES_TO_SECONDS = {
  '1': 60,
  '5': 300,
  '15': 900,
  '30': 1800,
  '60': 3600,
  '1D': 86400,
  '1W': 604800,
  '1M': 2592000
};

/**
 * The desk's resolution ids → the timeframes `timeframeSchema` accepts.
 * An id with no mapping is not charted at all rather than silently charted at a
 * different timeframe — a chart labelled 1W drawn from 1m candles is worse than
 * no chart, because nothing on screen reveals the mismatch.
 */
var RES_TO_TIMEFRAME = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '1D': '1d',
  '1W': '1w'
};

var MAX_CANDLES = 500;

function KlineChart(options) {
  this.hostEl = options.hostEl;
  /* Base of the CCXT REST surface, e.g. '/api/v1'. */
  this.baseUrl = options.baseUrl;
  this.symbol = options.symbol;
  this.resolution = options.resolution || '60';
  this.stompClient = options.stompClient || null;
  /* priceScale is 10^scale only when the desk published a scale (from market
     precision). A missing scale used to default to 2 decimals — that is an
     invented increment. null means: let the library infer from the bars. */
  var scale = options.scale;
  this.priceScale =
    scale != null && isFinite(Number(scale)) && Number(scale) >= 0
      ? Math.pow(10, Number(scale))
      : null;
  this._chart = null;
  this._series = null;
  this._rsiSeries = null;
  this._macdSeries = null;
  this._macdSignalSeries = null;
  this._macdHistogramSeries = null;
  this._bars = [];
  this.indicatorVisibility = {
    rsi: !options.indicators || options.indicators.rsi !== false,
    macd: !options.indicators || options.indicators.macd !== false
  };
  this._handles = [];
  this._pending = [];
  this._disposed = false;
  this._lastBar = null;
  this._historyFence = chartFreshness.createLatestRequestFence();
  this._onState = typeof options.onState === 'function' ? options.onState : function () {};
  this._onAccessibleState = typeof options.onAccessibleState === 'function' ? options.onAccessibleState : function () {};
  this._accessibleCursorFromEnd = 0;
  this._followLatest = true;
  this._repriceStage = null;
  this._repriceLine = null;
  this._repriceDrag = null;
}

KlineChart.prototype._emitAccessibleState = function () {
  var state = chartAccessibility.snapshot(this._bars, this._accessibleCursorFromEnd);
  this._onAccessibleState(state);
  return state;
};

KlineChart.prototype.moveAccessibleCursor = function (command) {
  if (!this._bars.length) return this._emitAccessibleState();
  if (command === 'oldest') this._accessibleCursorFromEnd = this._bars.length - 1;
  else if (command === 'latest') this._accessibleCursorFromEnd = 0;
  else this._accessibleCursorFromEnd = chartAccessibility.clampCursor(this._bars.length, this._accessibleCursorFromEnd + command);
  this._followLatest = this._accessibleCursorFromEnd === 0;
  return this._emitAccessibleState();
};

KlineChart.prototype.fitContent = function () {
  if (this._chart) this._chart.timeScale().fitContent();
};

KlineChart.prototype.followLatest = function () {
  this._accessibleCursorFromEnd = 0;
  this._followLatest = true;
  if (this._chart) this._chart.timeScale().scrollToRealTime();
  return this._emitAccessibleState();
};

KlineChart.prototype._removeRepriceLine = function () {
  if (this._series && this._repriceLine) {
    try {
      this._series.removePriceLine(this._repriceLine);
    } catch (error) {
      /* The chart or series may already be disposing. */
    }
  }
  this._repriceLine = null;
  this._repriceDrag = null;
};

KlineChart.prototype._renderRepriceLine = function () {
  this._removeRepriceLine();
  if (!this._series || !this._repriceStage) return;
  var price = chartReprice.toRendererPrice(this._repriceStage.price);
  if (price === null) return;
  this._repriceLine = this._series.createPriceLine({
    price: price,
    color: '#c8c8c8',
    lineWidth: 2,
    lineStyle: 2,
    axisLabelVisible: true,
    title: 'STAGED ' + (this._repriceStage.label || 'AMEND')
  });
};

KlineChart.prototype.setRepriceStage = function (stage) {
  if (!stage) {
    this._repriceStage = null;
    this._removeRepriceLine();
    return false;
  }
  var snapped = chartReprice.snap(String(stage.price || ''), String(stage.tickSize || ''));
  if (!snapped) {
    this._repriceStage = null;
    this._removeRepriceLine();
    return false;
  }
  this._repriceStage = {
    price: snapped,
    tickSize: String(stage.tickSize),
    label: stage.label ? String(stage.label) : '',
    onStage: typeof stage.onStage === 'function' ? stage.onStage : function () {},
    onRelease: typeof stage.onRelease === 'function' ? stage.onRelease : function () {}
  };
  this._renderRepriceLine();
  if (snapped !== String(stage.price || '').trim()) this._repriceStage.onStage(snapped, 'snap');
  return true;
};

KlineChart.prototype._applyReprice = function (price, source) {
  if (!this._repriceStage || !price) return null;
  this._repriceStage.price = price;
  if (this._repriceLine) {
    var rendered = chartReprice.toRendererPrice(price);
    if (rendered !== null) this._repriceLine.applyOptions({ price: rendered });
  }
  this._repriceStage.onStage(price, source || 'control');
  return price;
};

KlineChart.prototype.nudgeReprice = function (count) {
  if (!this._repriceStage) return null;
  return this._applyReprice(
    chartReprice.step(this._repriceStage.price, this._repriceStage.tickSize, count),
    'keyboard'
  );
};

KlineChart.prototype._pointerStepPlan = function () {
  if (!this._series || !this._repriceStage) return null;
  var currentNumber = chartReprice.toRendererPrice(this._repriceStage.price);
  var currentCoordinate = currentNumber === null ? null : this._series.priceToCoordinate(currentNumber);
  if (currentCoordinate === null || !isFinite(currentCoordinate)) return null;
  for (var factor = 1; factor <= 1000000000000; factor *= 10) {
    var next = chartReprice.step(this._repriceStage.price, this._repriceStage.tickSize, factor);
    var nextNumber = next && chartReprice.toRendererPrice(next);
    var nextCoordinate = nextNumber === null ? null : this._series.priceToCoordinate(nextNumber);
    var coordinateDelta = nextCoordinate === null ? 0 : nextCoordinate - currentCoordinate;
    if (isFinite(coordinateDelta) && Math.abs(coordinateDelta) >= 0.25) {
      return { factor: factor, coordinateDelta: coordinateDelta, lineCoordinate: currentCoordinate };
    }
  }
  return null;
};

KlineChart.prototype._installRepricePointer = function () {
  if (!this.hostEl) return;
  var self = this;
  this._onRepricePointerDown = function (event) {
    if (!self._repriceStage || !self._repriceLine || event.button !== 0) return;
    var plan = self._pointerStepPlan();
    if (!plan) return;
    var bounds = self.hostEl.getBoundingClientRect();
    var y = event.clientY - bounds.top;
    if (Math.abs(y - plan.lineCoordinate) > 14) return;
    event.preventDefault();
    event.stopPropagation();
    self._repriceDrag = {
      pointerId: event.pointerId,
      startY: y,
      startPrice: self._repriceStage.price,
      factor: plan.factor,
      coordinateDelta: plan.coordinateDelta
    };
    if (self.hostEl.setPointerCapture) self.hostEl.setPointerCapture(event.pointerId);
  };
  this._onRepricePointerMove = function (event) {
    var drag = self._repriceDrag;
    if (!drag || drag.pointerId !== event.pointerId || !self._repriceStage) return;
    event.preventDefault();
    var bounds = self.hostEl.getBoundingClientRect();
    var y = event.clientY - bounds.top;
    var groups = Math.round((y - drag.startY) / drag.coordinateDelta);
    var count = groups * drag.factor;
    if (!Number.isSafeInteger(count)) return;
    self._applyReprice(chartReprice.step(drag.startPrice, self._repriceStage.tickSize, count), 'pointer');
  };
  this._onRepricePointerUp = function (event) {
    var drag = self._repriceDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    self._repriceDrag = null;
    if (self.hostEl.releasePointerCapture && self.hostEl.hasPointerCapture && self.hostEl.hasPointerCapture(event.pointerId)) {
      self.hostEl.releasePointerCapture(event.pointerId);
    }
    if (self._repriceStage) self._repriceStage.onRelease(self._repriceStage.price);
  };
  this.hostEl.addEventListener('pointerdown', this._onRepricePointerDown, true);
  this.hostEl.addEventListener('pointermove', this._onRepricePointerMove, true);
  this.hostEl.addEventListener('pointerup', this._onRepricePointerUp, true);
  this.hostEl.addEventListener('pointercancel', this._onRepricePointerUp, true);
};

/** Resolves 'ok' | 'empty' | 'failed' | 'superseded'. See _loadHistory. */
KlineChart.prototype.mount = function () {
  if (!this.hostEl || this._disposed) {
    return Promise.resolve('failed');
  }
  this.hostEl.innerHTML = '';
  this._chart = createChart(this.hostEl, {
    width: this.hostEl.clientWidth || 600,
    height: this.hostEl.clientHeight || 420,
    layout: {
      background: { type: 'solid', color: '#000000' },
      textColor: '#c8c8c8',
      panes: {
        separatorColor: 'rgba(255,255,255,0.12)',
        separatorHoverColor: 'rgba(200,200,200,0.28)',
        enableResize: true
      }
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.06)' },
      horzLines: { color: 'rgba(255,255,255,0.06)' }
    },
    crosshair: { mode: 0 },
    rightPriceScale: { borderColor: 'rgba(255,255,255,0.12)' },
    timeScale: { borderColor: 'rgba(255,255,255,0.12)', timeVisible: true, secondsVisible: false },
    localization: { locale: 'en-US' }
  });
  var seriesOpts = {
    upColor: '#0ecb81',
    downColor: '#f6465d',
    borderVisible: false,
    wickUpColor: '#0ecb81',
    wickDownColor: '#f6465d'
  };
  /* Only pin axis precision when the instrument published it. Without a scale,
     omit priceFormat so the chart library derives precision from the OHLC bars
     rather than inventing two decimal places. */
  if (this.priceScale) {
    seriesOpts.priceFormat = {
      type: 'price',
      precision: Math.max(0, Math.round(Math.log10(this.priceScale))),
      minMove: 1 / this.priceScale
    };
  }
  this._series = this._chart.addSeries(LightweightCharts.CandlestickSeries, seriesOpts, 0);
  this._rebuildIndicatorSeries();
  this._renderRepriceLine();
  this._installRepricePointer();

  var self = this;
  this._onResize = function () {
    if (!self._chart || !self.hostEl) return;
    self._chart.applyOptions({
      width: self.hostEl.clientWidth || 600,
      height: self.hostEl.clientHeight || 420
    });
  };
  window.addEventListener('resize', this._onResize);

  return this._loadHistory().then(function (status) {
    if (self._disposed) return 'failed';
    self._subscribeLive();
    return status;
  });
};

KlineChart.prototype.setIndicators = function (visibility) {
  var next = visibility && typeof visibility === 'object' ? visibility : {};
  this.indicatorVisibility = {
    rsi: next.rsi !== false,
    macd: next.macd !== false
  };
  this._rebuildIndicatorSeries();
};

KlineChart.prototype._removeIndicatorSeries = function () {
  if (!this._chart) return;
  var series = [
    this._rsiSeries,
    this._macdSeries,
    this._macdSignalSeries,
    this._macdHistogramSeries
  ];
  for (var i = 0; i < series.length; i++) {
    if (!series[i]) continue;
    try {
      this._chart.removeSeries(series[i]);
    } catch (e) {
      /* A pane may already have been removed with its final series. */
    }
  }
  this._rsiSeries = null;
  this._macdSeries = null;
  this._macdSignalSeries = null;
  this._macdHistogramSeries = null;
};

KlineChart.prototype._rebuildIndicatorSeries = function () {
  if (!this._chart) return;
  this._removeIndicatorSeries();
  var mounted = chartAdapter.mountIndicatorPlan(
    this._chart,
    LightweightCharts,
    chartAdapter.buildIndicatorPlan(this.indicatorVisibility, this.priceScale)
  );
  this._rsiSeries = mounted.rsi || null;
  this._macdSeries = mounted.macd || null;
  this._macdSignalSeries = mounted.macdSignal || null;
  this._macdHistogramSeries = mounted.macdHistogram || null;
  this._renderIndicators();
};

KlineChart.prototype._renderIndicators = function () {
  var rows = chartAdapter.indicatorDataForRenderer(this._bars);
  if (this._rsiSeries) this._rsiSeries.setData(rows.rsi);
  if (this._macdSeries) this._macdSeries.setData(rows.macd);
  if (this._macdSignalSeries) this._macdSignalSeries.setData(rows.macdSignal);
  if (this._macdHistogramSeries) this._macdHistogramSeries.setData(rows.macdHistogram);
  if (this._chart && this._bars.length) {
    var panes = this._chart.panes();
    for (var i = 1; i < panes.length; i++) panes[i].setHeight(86);
  }
};

KlineChart.prototype.attach = function (stompClient) {
  this.stompClient = stompClient || null;
  if (!this.stompClient || this._disposed) return;
  var queued = this._pending;
  this._pending = [];
  for (var i = 0; i < queued.length; i++) {
    this._sub(queued[i].topic, queued[i].handler);
  }
};

KlineChart.prototype.setResolution = function (resolution) {
  this.resolution = resolution;
  return this._loadHistory();
};

KlineChart.prototype.dispose = function () {
  this._disposed = true;
  this._historyFence.dispose();
  this._pending = [];
  for (var i = 0; i < this._handles.length; i++) {
    try {
      this._handles[i].unsubscribe();
    } catch (e) {
      /* socket already gone */
    }
  }
  this._handles = [];
  this._removeRepriceLine();
  if (this.hostEl && this._onRepricePointerDown) {
    this.hostEl.removeEventListener('pointerdown', this._onRepricePointerDown, true);
    this.hostEl.removeEventListener('pointermove', this._onRepricePointerMove, true);
    this.hostEl.removeEventListener('pointerup', this._onRepricePointerUp, true);
    this.hostEl.removeEventListener('pointercancel', this._onRepricePointerUp, true);
  }
  this._onRepricePointerDown = null;
  this._onRepricePointerMove = null;
  this._onRepricePointerUp = null;
  if (this._onResize) {
    window.removeEventListener('resize', this._onResize);
    this._onResize = null;
  }
  if (this._chart) {
    try {
      this._chart.remove();
    } catch (e) {
      if (this.hostEl) this.hostEl.innerHTML = '';
    }
  }
  this._chart = null;
  this._series = null;
  this._rsiSeries = null;
  this._macdSeries = null;
  this._macdSignalSeries = null;
  this._macdHistogramSeries = null;
  this._bars = [];
  this._onAccessibleState(null);
  this.stompClient = null;
  this._lastBar = null;
  this._repriceStage = null;
};

/**
 * Load candle history. Resolves 'ok' | 'empty' | 'failed' | 'superseded' — never a boolean,
 * because two of those three used to share one value and they are not the same
 * fact. See the header.
 */
KlineChart.prototype._loadHistory = function () {
  var self = this;
  if (!this._series) return Promise.resolve('failed');

  var requestId = this._historyFence.begin();
  var requestedResolution = this.resolution;
  var requestedSymbol = this.symbol;
  this._onState(chartFreshness.snapshotState('loading', []));

  var timeframe = RES_TO_TIMEFRAME[requestedResolution];
  if (!timeframe) {
    // The venue does not serve this timeframe. Draw nothing and say so rather
    // than substituting one it does serve.
    this._series.setData([]);
    this._bars = [];
    this._emitAccessibleState();
    this._renderIndicators();
    this._lastBar = null;
    this._onState(chartFreshness.snapshotState('failed', []));
    return Promise.resolve('failed');
  }

  var to = Date.now();
  var spanSec = (RES_TO_SECONDS[requestedResolution] || 3600) * MAX_CANDLES;
  var from = to - spanSec * 1000;

  return new Promise(function (resolve) {
    $.ajax({
      type: 'GET',
      // The slash in a unified symbol must be encoded or it becomes a path
      // separator and reaches a route that does not exist.
      url: self.baseUrl + '/ohlcv/' + encodeURIComponent(requestedSymbol),
      dataType: 'json',
      data: {
        timeframe: timeframe,
        since: from,
        limit: MAX_CANDLES
      }
    })
      .done(function (response) {
        if (!self._historyFence.isCurrent(requestId)) {
          resolve('superseded');
          return;
        }
        if (self._disposed || !self._series) {
          resolve('failed');
          return;
        }
        var data = Array.isArray(response) ? response : [];
        // Wire: [timestampMs, open, high, low, close, volume]. OHLC must be
        // decimal STRINGS (ix-wire.candle law). JSON numbers refused in kline-ohlcv.
        // Canonical bars remain scaled bigint. The adapter creates disposable
        // numbers only for the canvas renderer and they never feed state back.
        var deduped = klineOhlcv.barsFromHistory(data);
        self._series.setData(chartAdapter.candlesForRenderer(deduped));
        self._bars = deduped.slice();
        self._accessibleCursorFromEnd = 0;
        self._followLatest = true;
        self._renderIndicators();
        self._emitAccessibleState();
        self._lastBar = deduped.length ? deduped[deduped.length - 1] : null;
        if (self._chart) self._chart.timeScale().fitContent();
        // An empty series is a true answer: this market has never traded.
        var status = deduped.length ? 'ok' : 'empty';
        self._onState(chartFreshness.snapshotState(status, deduped));
        resolve(status);
      })
      .fail(function () {
        if (!self._historyFence.isCurrent(requestId)) {
          resolve('superseded');
          return;
        }
        // We do NOT know that there are no candles — we know we did not hear.
        if (self._series) self._series.setData([]);
        self._bars = [];
        self._emitAccessibleState();
        self._renderIndicators();
        self._lastBar = null;
        self._onState(chartFreshness.snapshotState('failed', []));
        resolve('failed');
      });
  });
};

KlineChart.prototype._sub = function (topic, handler) {
  if (this._disposed) return;
  if (!this.stompClient || this.stompClient.connected !== true) {
    this._pending.push({ topic: topic, handler: handler });
    return;
  }
  try {
    this._handles.push(this.stompClient.subscribe(topic, handler));
  } catch (e) {
    this._pending.push({ topic: topic, handler: handler });
  }
};

KlineChart.prototype._upsertBar = function (bar) {
  if (!bar || !fixed.isFixed(bar.close)) return;
  var last = this._bars.length ? this._bars[this._bars.length - 1] : null;
  var appended = !last || bar.time > last.time;
  if (last && last.time === bar.time) this._bars[this._bars.length - 1] = bar;
  else if (appended) this._bars.push(bar);
  if (appended && !this._followLatest) this._accessibleCursorFromEnd += 1;
  if (this._bars.length > MAX_CANDLES) this._bars = this._bars.slice(-MAX_CANDLES);
  this._accessibleCursorFromEnd = chartAccessibility.clampCursor(this._bars.length, this._accessibleCursorFromEnd);
  this._renderIndicators();
  this._emitAccessibleState();
};

KlineChart.prototype._subscribeLive = function () {
  var self = this;
  var symbol = this.symbol;

  this._sub('/topic/market/trade/' + symbol, function (msg) {
    var resp;
    try {
      resp = JSON.parse(msg.body);
    } catch (e) {
      return;
    }
    if (!self._series || !self._lastBar || !resp || !resp.length) return;
    var wirePrice = resp[resp.length - 1].price;
    if (typeof wirePrice !== 'string') return;
    var price = fixed.parse(wirePrice);
    if (!price) return;
    var bar = {
      time: self._lastBar.time,
      open: self._lastBar.open,
      high: fixed.compare(self._lastBar.high, price) >= 0 ? self._lastBar.high : price,
      low: fixed.compare(self._lastBar.low, price) <= 0 ? self._lastBar.low : price,
      close: price
    };
    self._lastBar = bar;
    var rendered = chartAdapter.candleForRenderer(bar);
    if (rendered) self._series.update(rendered);
    self._upsertBar(bar);
  });

  this._sub('/topic/market/kline/' + symbol, function (msg) {
    if (self.resolution !== '1') return;
    var resp;
    try {
      resp = JSON.parse(msg.body);
    } catch (e) {
      return;
    }
    if (!self._series || !resp) return;
    if (
      typeof resp.openPrice !== 'string' ||
      typeof resp.highestPrice !== 'string' ||
      typeof resp.lowestPrice !== 'string' ||
      typeof resp.closePrice !== 'string'
    ) return;
    var t = resp.time;
    if (typeof t === 'string' && t.trim() !== '') t = Number(t);
    if (typeof t !== 'number' || !isFinite(t)) return;
    if (t > 1e12) t = Math.floor(t / 1000);
    var bar = {
      time: t,
      open: fixed.parse(resp.openPrice),
      high: fixed.parse(resp.highestPrice),
      low: fixed.parse(resp.lowestPrice),
      close: fixed.parse(resp.closePrice)
    };
    if (!bar.open || !bar.high || !bar.low || !bar.close) return;
    self._lastBar = bar;
    var rendered = chartAdapter.candleForRenderer(bar);
    if (rendered) self._series.update(rendered);
    self._upsertBar(bar);
  });
};

module.exports = { KlineChart: KlineChart };
