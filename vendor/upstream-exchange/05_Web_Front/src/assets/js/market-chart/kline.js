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
/* Vendored Apache-2.0 standalone build — see LICENSE.lightweight-charts */
require('./lightweight-charts.standalone.production.js');
var createChart = window.LightweightCharts.createChart;

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
  this._handles = [];
  this._pending = [];
  this._disposed = false;
  this._lastBar = null;
}

/** Resolves 'ok' | 'empty' | 'failed'. See _loadHistory. */
KlineChart.prototype.mount = function () {
  if (!this.hostEl || this._disposed) {
    return Promise.resolve('failed');
  }
  this.hostEl.innerHTML = '';
  this._chart = createChart(this.hostEl, {
    width: this.hostEl.clientWidth || 600,
    height: this.hostEl.clientHeight || 420,
    layout: {
      backgroundColor: '#000000',
      textColor: '#c8c8c8'
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
  this._series = this._chart.addCandlestickSeries(seriesOpts);

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
  this._pending = [];
  for (var i = 0; i < this._handles.length; i++) {
    try {
      this._handles[i].unsubscribe();
    } catch (e) {
      /* socket already gone */
    }
  }
  this._handles = [];
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
  this.stompClient = null;
  this._lastBar = null;
};

/**
 * Load candle history. Resolves 'ok' | 'empty' | 'failed' — never a boolean,
 * because two of those three used to share one value and they are not the same
 * fact. See the header.
 */
KlineChart.prototype._loadHistory = function () {
  var self = this;
  if (!this._series) return Promise.resolve('failed');

  var timeframe = RES_TO_TIMEFRAME[this.resolution];
  if (!timeframe) {
    // The venue does not serve this timeframe. Draw nothing and say so rather
    // than substituting one it does serve.
    this._series.setData([]);
    this._lastBar = null;
    return Promise.resolve('failed');
  }

  var to = Date.now();
  var spanSec = (RES_TO_SECONDS[this.resolution] || 3600) * MAX_CANDLES;
  var from = to - spanSec * 1000;

  return new Promise(function (resolve) {
    $.ajax({
      type: 'GET',
      // The slash in a unified symbol must be encoded or it becomes a path
      // separator and reaches a route that does not exist.
      url: self.baseUrl + '/ohlcv/' + encodeURIComponent(self.symbol),
      dataType: 'json',
      data: {
        timeframe: timeframe,
        since: from,
        limit: MAX_CANDLES
      }
    })
      .done(function (response) {
        if (self._disposed || !self._series) {
          resolve('failed');
          return;
        }
        var data = Array.isArray(response) ? response : [];
        var bars = [];
        for (var i = 0; i < data.length; i++) {
          var item = data[i];
          if (!item || item.length < 5) continue;
          // Wire: [timestampMs, open, high, low, close, volume]. The timestamp
          // is the bucket's OPEN time (CCXT convention) — labelling a candle
          // with its close time shifts the whole series by one bar.
          var t = item[0];
          if (t > 1e12) t = Math.floor(t / 1000);
          // OHLC arrive as decimal strings. lightweight-charts is a pixel
          // renderer and needs numbers; this is the last possible moment and
          // the value is never sent back anywhere.
          bars.push({
            time: t,
            open: parseFloat(item[1]),
            high: parseFloat(item[2]),
            low: parseFloat(item[3]),
            close: parseFloat(item[4])
          });
        }
        bars.sort(function (a, b) {
          return a.time - b.time;
        });
        // lightweight-charts requires unique ascending times
        var deduped = [];
        var lastT = -1;
        for (var j = 0; j < bars.length; j++) {
          if (bars[j].time === lastT) continue;
          deduped.push(bars[j]);
          lastT = bars[j].time;
        }
        self._series.setData(deduped);
        self._lastBar = deduped.length ? deduped[deduped.length - 1] : null;
        if (self._chart) self._chart.timeScale().fitContent();
        // An empty series is a true answer: this market has never traded.
        resolve(deduped.length ? 'ok' : 'empty');
      })
      .fail(function () {
        // We do NOT know that there are no candles — we know we did not hear.
        if (self._series) self._series.setData([]);
        self._lastBar = null;
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
    var price = resp[resp.length - 1].price;
    var bar = {
      time: self._lastBar.time,
      open: self._lastBar.open,
      high: Math.max(self._lastBar.high, price),
      low: Math.min(self._lastBar.low, price),
      close: price
    };
    self._lastBar = bar;
    self._series.update(bar);
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
    var t = resp.time;
    if (t > 1e12) t = Math.floor(t / 1000);
    var bar = {
      time: t,
      open: resp.openPrice,
      high: resp.highestPrice,
      low: resp.lowestPrice,
      close: resp.closePrice
    };
    self._lastBar = bar;
    self._series.update(bar);
  });
};

module.exports = { KlineChart: KlineChart };
