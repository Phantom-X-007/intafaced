/* ============================================================================
   INTAFACED — lawful market chart (lightweight-charts, Apache-2.0)
   ----------------------------------------------------------------------------
   Replaces the unlicensed Charting Library that arrived with the vendored
   shell. History and live bars use the same /market/history + STOMP topics
   the terminal already serves; empty backend → empty chart frame, not a
   red error dialog.
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

function KlineChart(options) {
  this.hostEl = options.hostEl;
  this.baseUrl = options.baseUrl; // e.g. host + '/market'
  this.symbol = options.symbol;
  this.resolution = options.resolution || '60';
  this.stompClient = options.stompClient || null;
  this.priceScale = Math.pow(10, options.scale || 2);
  this._chart = null;
  this._series = null;
  this._handles = [];
  this._pending = [];
  this._disposed = false;
  this._lastBar = null;
}

KlineChart.prototype.mount = function () {
  if (!this.hostEl || this._disposed) {
    return Promise.resolve(false);
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
  this._series = this._chart.addCandlestickSeries({
    upColor: '#0ecb81',
    downColor: '#f6465d',
    borderVisible: false,
    wickUpColor: '#0ecb81',
    wickDownColor: '#f6465d',
    priceFormat: { type: 'price', precision: Math.max(0, Math.round(Math.log10(this.priceScale))), minMove: 1 / this.priceScale }
  });

  var self = this;
  this._onResize = function () {
    if (!self._chart || !self.hostEl) return;
    self._chart.applyOptions({
      width: self.hostEl.clientWidth || 600,
      height: self.hostEl.clientHeight || 420
    });
  };
  window.addEventListener('resize', this._onResize);

  return this._loadHistory().then(function (ok) {
    if (self._disposed) return false;
    self._subscribeLive();
    return ok;
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

KlineChart.prototype._loadHistory = function () {
  var self = this;
  if (!this._series) return Promise.resolve(false);

  var to = Date.now();
  var spanSec = (RES_TO_SECONDS[this.resolution] || 3600) * 400;
  var from = to - spanSec * 1000;

  return new Promise(function (resolve) {
    $.ajax({
      type: 'GET',
      url: self.baseUrl + '/history',
      dataType: 'json',
      data: {
        symbol: self.symbol,
        from: from,
        to: to,
        resolution: self.resolution
      }
    })
      .done(function (response) {
        if (self._disposed || !self._series) {
          resolve(false);
          return;
        }
        var data = response || [];
        var bars = [];
        for (var i = 0; i < data.length; i++) {
          var item = data[i];
          // API: [timeMs, open, high, low, close, volume]
          var t = item[0];
          if (t > 1e12) t = Math.floor(t / 1000);
          bars.push({
            time: t,
            open: item[1],
            high: item[2],
            low: item[3],
            close: item[4]
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
        resolve(true);
      })
      .fail(function () {
        if (self._series) self._series.setData([]);
        self._lastBar = null;
        resolve(true); // empty frame is success
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
