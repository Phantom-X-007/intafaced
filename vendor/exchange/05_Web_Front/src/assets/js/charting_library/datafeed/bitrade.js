/* ============================================================================
   INTAFACED — market datafeed for the TradingView charting library
   ----------------------------------------------------------------------------
   Two behaviours matter here beyond "fetch bars":

   1. The chart must be constructable BEFORE the market websocket is up. The
      vendor built the feed inside the STOMP connect callback, so a backend that
      never answers meant no chart at all — a blank pane. The feed now takes the
      client lazily: subscriptions raised before the socket exists are queued
      and replayed by attach().

   2. A dead backend must not raise TradingView's error dialog. onErrorCallback
      makes the library show a red banner and retry; an empty history with
      noData renders the chart frame with nothing in it, which is the correct
      empty state.
   ========================================================================== */

var $ = require('jquery');

var RESOLUTIONS = ['1', '5', '15', '30', '60', '1D', '1W', '1M'];

var WebsockFeed = function (url, coin, stompClient, scale) {
    this._datafeedURL = url;
    this.coin = coin;
    this.stompClient = stompClient || null;
    this.lastBar = null;
    this.currentBar = null;
    this.scale = scale;
    this._pending = [];
    this._handles = [];
    this._disposed = false;
};

/* Hand the feed a live STOMP client and flush anything queued while it was
   down. Safe to call more than once — a reconnect re-subscribes. */
WebsockFeed.prototype.attach = function (stompClient) {
    this.stompClient = stompClient || null;
    if (!this.stompClient || this._disposed) {
        return;
    }
    var queued = this._pending;
    this._pending = [];
    for (var i = 0; i < queued.length; i++) {
        this._subscribe(queued[i].topic, queued[i].handler);
    }
};

WebsockFeed.prototype.dispose = function () {
    this._disposed = true;
    this._pending = [];
    for (var i = 0; i < this._handles.length; i++) {
        try {
            this._handles[i].unsubscribe();
        } catch (e) {
            /* the socket is already gone; nothing to release */
        }
    }
    this._handles = [];
    this.stompClient = null;
};

WebsockFeed.prototype._subscribe = function (topic, handler) {
    if (this._disposed) {
        return;
    }
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

WebsockFeed.prototype.onReady = function (callback) {
    var config = {
        exchanges: [],
        supported_resolutions: RESOLUTIONS,
        supports_group_request: false,
        supports_marks: false,
        supports_search: false,
        supports_time: true,
        supports_timescale_marks: false
    };
    setTimeout(function () {
        callback(config);
    }, 0);
};

WebsockFeed.prototype.subscribeBars = function (symbolInfo, resolution, onRealtimeCallback) {
    var that = this;

    this._subscribe('/topic/market/trade/' + symbolInfo.name, function (msg) {
        var resp;
        try {
            resp = JSON.parse(msg.body);
        } catch (e) {
            return;
        }
        if (that.lastBar === null || !resp || resp.length === 0) {
            return;
        }
        var price = resp[resp.length - 1].price;
        that.lastBar.close = price;
        if (price > that.lastBar.high) {
            that.lastBar.high = price;
        }
        if (price < that.lastBar.low) {
            that.lastBar.low = price;
        }
        onRealtimeCallback(that.lastBar);
    });

    this._subscribe('/topic/market/kline/' + symbolInfo.name, function (msg) {
        if (resolution !== '1') {
            return;
        }
        var resp;
        try {
            resp = JSON.parse(msg.body);
        } catch (e) {
            return;
        }
        if (that.currentBar !== null) {
            onRealtimeCallback(that.currentBar);
        }
        that.lastBar = {
            time: resp.time,
            open: resp.openPrice,
            high: resp.highestPrice,
            low: resp.lowestPrice,
            close: resp.closePrice,
            volume: resp.volume
        };
        that.currentBar = that.lastBar;
        onRealtimeCallback(that.lastBar);
    });
};

WebsockFeed.prototype.unsubscribeBars = function () {
    this.dispose();
};

WebsockFeed.prototype.resolveSymbol = function (symbolName, onSymbolResolvedCallback) {
    var data = {
        name: this.coin.symbol,
        'exchange-traded': '',
        'exchange-listed': '',
        minmov: 1,
        volumescale: 10000,
        has_daily: true,
        has_weekly_and_monthly: true,
        has_intraday: true,
        description: this.coin.symbol,
        type: 'crypto',
        session: '24x7',
        supported_resolutions: RESOLUTIONS,
        pricescale: Math.pow(10, this.scale || 2),
        ticker: '',
        timezone: 'Etc/UTC'
    };
    setTimeout(function () {
        onSymbolResolvedCallback(data);
    }, 0);
};

WebsockFeed.prototype._send = function (url, params) {
    var request = url;
    if (params) {
        var keys = Object.keys(params);
        for (var i = 0; i < keys.length; ++i) {
            request += (i === 0 ? '?' : '&') + keys[i] + '=' + encodeURIComponent(params[keys[i]]);
        }
    }
    return $.ajax({ type: 'GET', url: request, dataType: 'json' });
};

WebsockFeed.prototype.getBars = function (symbolInfo, resolution, from, to, onHistoryCallback, onErrorCallback, firstDataRequest) {
    var bars = [];
    var that = this;

    this._send(this._datafeedURL + '/history', {
        symbol: symbolInfo.name,
        from: from * 1000,
        to: firstDataRequest ? new Date().getTime() : to * 1000,
        resolution: resolution
    })
        .done(function (response) {
            var data = response || [];
            for (var i = 0; i < data.length; i++) {
                var item = data[i];
                bars.push({
                    time: item[0],
                    open: item[1],
                    high: item[2],
                    low: item[3],
                    close: item[4],
                    volume: item[5]
                });
            }
            that.lastBar = bars.length > 0 ? bars[bars.length - 1] : null;
            that.currentBar = that.lastBar;
            onHistoryCallback(bars, { noData: bars.length === 0 });
        })
        .fail(function () {
            /* Empty state, not an error state — see the note at the top. */
            onHistoryCallback([], { noData: true });
        });
};

WebsockFeed.prototype.periodLengthSeconds = function (resolution, requiredPeriodsCount) {
    var daysCount = 0;
    if (resolution === 'D') {
        daysCount = requiredPeriodsCount;
    } else if (resolution === 'M') {
        daysCount = 31 * requiredPeriodsCount;
    } else if (resolution === 'W') {
        daysCount = 7 * requiredPeriodsCount;
    } else if (resolution === 'H') {
        daysCount = requiredPeriodsCount * resolution / 24;
    } else {
        daysCount = requiredPeriodsCount * resolution / (24 * 60);
    }
    return daysCount * 24 * 60 * 60;
};

export default { WebsockFeed };
