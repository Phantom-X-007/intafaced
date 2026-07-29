<template>
  <div class="ix-terminal">
    <!-- ══ pair header ══════════════════════════════════════════════════ -->
    <header class="ix-head">
      <div class="ix-head-pair">
        <button
          type="button"
          class="ix-star"
          :class="{ 'is-on': currentCoinIsFavor }"
          @click="toggleFavorite"
          :title="currentCoinIsFavor ? 'Remove from favourites' : 'Add to favourites'"
        >
          <Icon :type="currentCoinIsFavor ? 'ios-star' : 'ios-star-outline'" size="18" />
        </button>
        <div class="ix-pair">
          <span class="ix-pair-coin">{{ currentCoin.coin || '—' }}</span>
          <span class="ix-pair-base">/{{ currentCoin.base || '—' }}</span>
        </div>
        <Poptip
          v-if="coinInfo.information"
          trigger="hover"
          :title="coinInfo.name"
          placement="bottom-start"
          word-wrap
          width="320"
        >
          <Icon type="md-information-circle" class="ix-info-icon" size="15" />
          <div slot="content">
            <p class="ix-coin-info">{{ coinInfo.information }}</p>
            <p class="ix-coin-link" v-if="coinInfo.infolink">
              <a :href="coinInfo.infolink" target="_blank" rel="noopener">More detail</a>
            </p>
          </div>
        </Poptip>
      </div>

      <div class="ix-head-last">
        <span class="ix-last" :class="trendClass">{{ fmt(lastPrice, baseCoinScale) }}</span>
        <span class="ix-last-alt" v-if="fiatValue">&asymp; {{ fiatValue }} CNY</span>
      </div>

      <dl class="ix-stat">
        <dt>24h Change</dt>
        <dd :class="trendClass">{{ currentCoin.rose || '—' }}</dd>
      </dl>
      <dl class="ix-stat">
        <dt>24h High</dt>
        <dd>{{ fmt(currentCoin.high, baseCoinScale) }}</dd>
      </dl>
      <dl class="ix-stat">
        <dt>24h Low</dt>
        <dd>{{ fmt(currentCoin.low, baseCoinScale) }}</dd>
      </dl>
      <dl class="ix-stat ix-stat-wide">
        <dt>24h Volume</dt>
        <dd>{{ fmt(currentCoin.volume, 2) }} <em>{{ currentCoin.coin }}</em></dd>
      </dl>

      <div class="ix-head-status" :class="{ 'is-down': !feedLive }">
        <i class="ix-dot"></i>{{ feedLive ? 'Live' : 'No feed' }}
      </div>
    </header>

    <!-- ══ body ═════════════════════════════════════════════════════════ -->
    <div class="ix-body">
      <!-- ── markets ──────────────────────────────────────────────────── -->
      <aside class="ix-panel ix-markets">
        <div class="ix-markets-search">
          <input
            type="text"
            v-model="searchKey"
            placeholder="Search market"
            spellcheck="false"
          />
        </div>
        <nav class="ix-tabs ix-tabs-sm">
          <button
            type="button"
            v-if="isLogin"
            :class="{ 'is-active': baseFilter === 'favor' }"
            @click="baseFilter = 'favor'"
          >★</button>
          <button
            type="button"
            v-for="base in ['USDT', 'BTC', 'ETH']"
            :key="base"
            :class="{ 'is-active': baseFilter === base }"
            @click="baseFilter = base"
          >{{ base }}</button>
        </nav>
        <div class="ix-thead ix-thead-markets">
          <span>Pair</span>
          <span class="ix-num">Last</span>
          <span class="ix-num">24h</span>
        </div>
        <div class="ix-scroll">
          <p class="ix-empty" v-if="visibleMarkets.length === 0">No markets</p>
          <button
            type="button"
            class="ix-market-row"
            :class="{ 'is-current': row.symbol === currentCoin.symbol }"
            v-for="row in visibleMarkets"
            :key="row.symbol"
            @click="openPair(row)"
          >
            <span class="ix-market-name">
              <i
                class="ix-star ix-star-inline"
                :class="{ 'is-on': row.isFavor }"
                @click.stop="toggleRowFavorite(row)"
              >
                <Icon :type="row.isFavor ? 'ios-star' : 'ios-star-outline'" size="12" />
              </i>
              {{ row.coin }}<em>/{{ row.base }}</em>
            </span>
            <span class="ix-num">{{ fmt(row.close, 6) }}</span>
            <span class="ix-num" :class="roseClass(row.rose)">{{ row.rose }}</span>
          </button>
        </div>
      </aside>

      <!-- ── centre: chart + account ──────────────────────────────────── -->
      <main class="ix-centre">
        <section class="ix-panel ix-chart-panel">
          <nav class="ix-tabs ix-tabs-head">
            <button
              type="button"
              v-for="tab in mainTabs"
              :key="tab.id"
              :class="{ 'is-active': mainTab === tab.id }"
              @click="selectMainTab(tab.id)"
            >{{ tab.label }}</button>

            <div class="ix-intervals" v-show="mainTab === 'chart'">
              <button
                type="button"
                v-for="tf in intervals"
                :key="tf.value"
                :class="{ 'is-active': interval === tf.value }"
                @click="setChartInterval(tf.value)"
              >{{ tf.label }}</button>
            </div>
          </nav>

          <div class="ix-chart-body">
            <!-- The chart host. Explicit height + overflow:hidden; the widget
                 fills it at 100% because `fullscreen` is off. -->
            <div id="ix_kline" class="ix-kline" v-show="mainTab === 'chart'"></div>
            <p class="ix-empty ix-empty-abs" v-if="mainTab === 'chart' && chartFailed">
              Chart unavailable
            </p>

            <div class="ix-depth-host" v-show="mainTab === 'depth'">
              <DepthGraph ref="depthGraph" />
            </div>

            <div class="ix-book-full" v-show="mainTab === 'book'">
              <div class="ix-book-col">
                <div class="ix-thead ix-thead-book">
                  <span class="ix-num">Price ({{ currentCoin.base }})</span>
                  <span class="ix-num">Amount ({{ currentCoin.coin }})</span>
                  <span class="ix-num">Total</span>
                </div>
                <div class="ix-scroll">
                  <p class="ix-empty" v-if="bids.length === 0">No bids</p>
                  <button
                    type="button"
                    class="ix-book-row is-bid"
                    v-for="(row, i) in bids"
                    :key="'fb' + i"
                    @click="useBookPrice(row)"
                  >
                    <span class="ix-depth-bar" :style="{ width: barWidth(row, 'bid') }"></span>
                    <span class="ix-num ix-up">{{ fmt(row.price, baseCoinScale) }}</span>
                    <span class="ix-num">{{ fmt(row.amount, coinScale) }}</span>
                    <span class="ix-num ix-dim">{{ fmt(row.totalAmount, coinScale) }}</span>
                  </button>
                </div>
              </div>
              <div class="ix-book-col">
                <div class="ix-thead ix-thead-book">
                  <span class="ix-num">Price ({{ currentCoin.base }})</span>
                  <span class="ix-num">Amount ({{ currentCoin.coin }})</span>
                  <span class="ix-num">Total</span>
                </div>
                <div class="ix-scroll">
                  <p class="ix-empty" v-if="asksAscending.length === 0">No asks</p>
                  <button
                    type="button"
                    class="ix-book-row is-ask"
                    v-for="(row, i) in asksAscending"
                    :key="'fa' + i"
                    @click="useBookPrice(row)"
                  >
                    <span class="ix-depth-bar" :style="{ width: barWidth(row, 'ask') }"></span>
                    <span class="ix-num ix-down">{{ fmt(row.price, baseCoinScale) }}</span>
                    <span class="ix-num">{{ fmt(row.amount, coinScale) }}</span>
                    <span class="ix-num ix-dim">{{ fmt(row.totalAmount, coinScale) }}</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="ix-trades-full" v-show="mainTab === 'trades'">
              <div class="ix-thead ix-thead-trades-full">
                <span>Time</span>
                <span class="ix-num">Price ({{ currentCoin.base }})</span>
                <span class="ix-num">Amount ({{ currentCoin.coin }})</span>
                <span class="ix-num">Value</span>
              </div>
              <div class="ix-scroll">
                <p class="ix-empty" v-if="trades.length === 0">No trades yet</p>
                <div class="ix-trade-row is-wide" v-for="(row, i) in trades" :key="'ft' + i">
                  <span class="ix-dim">{{ time(row.time) }}</span>
                  <span class="ix-num" :class="row.direction === 'BUY' ? 'ix-up' : 'ix-down'">
                    {{ fmt(row.price, baseCoinScale) }}
                  </span>
                  <span class="ix-num">{{ fmt(row.amount, coinScale) }}</span>
                  <span class="ix-num ix-dim">{{ fmt(row.price * row.amount, 2) }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="ix-panel ix-account">
          <nav class="ix-tabs ix-tabs-head">
            <button
              type="button"
              v-for="tab in accountTabs"
              :key="tab.id"
              :class="{ 'is-active': accountTab === tab.id }"
              @click="accountTab = tab.id"
            >
              {{ tab.label }}<sup v-if="tab.count">{{ tab.count }}</sup>
            </button>
          </nav>

          <div class="ix-account-body">
            <p class="ix-empty" v-if="!isLogin">
              <router-link to="/login">Sign in</router-link> to see your balances and orders.
            </p>

            <!-- Balances -->
            <table class="ix-table" v-else-if="accountTab === 'balances'">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th class="ix-num">Available</th>
                  <th class="ix-num">Value</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in balanceRows" :key="row.unit">
                  <td class="ix-strong">{{ row.unit }}</td>
                  <td class="ix-num">{{ fmt(row.balance, row.scale) }}</td>
                  <td class="ix-num ix-dim">{{ row.valueLabel }}</td>
                  <td class="ix-num">
                    <router-link class="ix-link" :to="'/uc/recharge?name=' + row.unit">Deposit</router-link>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- Positions -->
            <p class="ix-empty" v-else-if="accountTab === 'positions'">
              Spot markets do not carry positions. Your holdings are under Balances.
            </p>

            <!-- Open orders -->
            <table class="ix-table" v-else-if="accountTab === 'open'">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Market</th>
                  <th>Type</th>
                  <th>Side</th>
                  <th class="ix-num">Price</th>
                  <th class="ix-num">Amount</th>
                  <th class="ix-num">Filled</th>
                  <th class="ix-num">Value</th>
                  <th class="ix-num"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in openOrders" :key="row.orderId || i">
                  <td class="ix-dim">{{ date(row.time) }}</td>
                  <td>{{ row.symbol }}</td>
                  <td class="ix-dim">{{ row.type === 'MARKET_PRICE' ? 'Market' : 'Limit' }}</td>
                  <td :class="row.direction === 'BUY' ? 'ix-up' : 'ix-down'">
                    {{ row.direction === 'BUY' ? 'Buy' : 'Sell' }}
                  </td>
                  <td class="ix-num">{{ priceLabel(row) }}</td>
                  <td class="ix-num">{{ fmt(row.amount, coinScale) }}</td>
                  <td class="ix-num">{{ fmt(row.tradedAmount, coinScale) }}</td>
                  <td class="ix-num">{{ fmt(row.turnover, 2) }}</td>
                  <td class="ix-num">
                    <button type="button" class="ix-cancel" @click="cancelOrder(row)">Cancel</button>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- Trade history (fills) -->
            <table class="ix-table" v-else-if="accountTab === 'fills'">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Market</th>
                  <th>Side</th>
                  <th class="ix-num">Price</th>
                  <th class="ix-num">Amount</th>
                  <th class="ix-num">Value</th>
                  <th class="ix-num">Fee</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in fills" :key="'fill' + i">
                  <td class="ix-dim">{{ date(row.time) }}</td>
                  <td>{{ row.symbol }}</td>
                  <td :class="row.direction === 'BUY' ? 'ix-up' : 'ix-down'">
                    {{ row.direction === 'BUY' ? 'Buy' : 'Sell' }}
                  </td>
                  <td class="ix-num">{{ fmt(row.price, baseCoinScale) }}</td>
                  <td class="ix-num">{{ fmt(row.amount, coinScale) }}</td>
                  <td class="ix-num">{{ fmt(row.turnover, 2) }}</td>
                  <td class="ix-num ix-dim">{{ fmt(row.fee, 8) }}</td>
                </tr>
              </tbody>
            </table>

            <!-- Order history -->
            <table class="ix-table" v-else>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Market</th>
                  <th>Type</th>
                  <th>Side</th>
                  <th class="ix-num">Price</th>
                  <th class="ix-num">Amount</th>
                  <th class="ix-num">Filled</th>
                  <th class="ix-num">Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in historyOrders" :key="row.orderId || 'h' + i">
                  <td class="ix-dim">{{ date(row.time) }}</td>
                  <td>{{ row.symbol }}</td>
                  <td class="ix-dim">{{ row.type === 'MARKET_PRICE' ? 'Market' : 'Limit' }}</td>
                  <td :class="row.direction === 'BUY' ? 'ix-up' : 'ix-down'">
                    {{ row.direction === 'BUY' ? 'Buy' : 'Sell' }}
                  </td>
                  <td class="ix-num">{{ priceLabel(row) }}</td>
                  <td class="ix-num">{{ fmt(row.amount, coinScale) }}</td>
                  <td class="ix-num">{{ fmt(row.tradedAmount, coinScale) }}</td>
                  <td class="ix-num">{{ fmt(row.turnover, 2) }}</td>
                  <td :class="statusClass(row.status)">{{ statusLabel(row.status) }}</td>
                </tr>
              </tbody>
            </table>

            <p class="ix-empty" v-if="isLogin && accountTabEmpty">Nothing here yet</p>
          </div>
        </section>
      </main>

      <!-- ── order book / trades rail ─────────────────────────────────── -->
      <aside class="ix-panel ix-rail">
        <nav class="ix-tabs ix-tabs-head">
          <button
            type="button"
            :class="{ 'is-active': railTab === 'book' }"
            @click="railTab = 'book'"
          >Order Book</button>
          <button
            type="button"
            :class="{ 'is-active': railTab === 'trades' }"
            @click="railTab = 'trades'"
          >Trades</button>
          <div class="ix-book-modes" v-show="railTab === 'book'">
            <button
              type="button"
              v-for="m in bookModes"
              :key="m.id"
              :class="['ix-book-mode', 'is-' + m.id, { 'is-active': bookMode === m.id }]"
              :title="m.label"
              @click="bookMode = m.id"
            ><i></i><i></i></button>
          </div>
        </nav>

        <div class="ix-rail-body" v-show="railTab === 'book'">
          <div class="ix-thead ix-thead-book">
            <span class="ix-num">Price</span>
            <span class="ix-num">Amount</span>
            <span class="ix-num">Total</span>
          </div>

          <div class="ix-book-side ix-book-asks" v-show="bookMode !== 'bids'">
            <p class="ix-empty" v-if="asks.length === 0">No asks</p>
            <button
              type="button"
              class="ix-book-row is-ask"
              v-for="(row, i) in asks"
              :key="'a' + i"
              @click="useBookPrice(row)"
            >
              <span class="ix-depth-bar" :style="{ width: barWidth(row, 'ask') }"></span>
              <span class="ix-num ix-down">{{ zero(row.price, baseCoinScale) }}</span>
              <span class="ix-num">{{ zero(row.amount, coinScale) }}</span>
              <span class="ix-num ix-dim">{{ zero(row.totalAmount, coinScale) }}</span>
            </button>
          </div>

          <div class="ix-book-mid">
            <span class="ix-book-price" :class="trendClass">{{ fmt(lastPrice, baseCoinScale) }}</span>
            <Icon v-if="trend > 0" type="md-arrow-up" class="ix-up" size="14" />
            <Icon v-else-if="trend < 0" type="md-arrow-down" class="ix-down" size="14" />
            <span class="ix-book-spread" v-if="spread !== null">Spread {{ spread }}</span>
          </div>

          <div class="ix-book-side ix-book-bids" v-show="bookMode !== 'asks'">
            <p class="ix-empty" v-if="bids.length === 0">No bids</p>
            <button
              type="button"
              class="ix-book-row is-bid"
              v-for="(row, i) in bids"
              :key="'b' + i"
              @click="useBookPrice(row)"
            >
              <span class="ix-depth-bar" :style="{ width: barWidth(row, 'bid') }"></span>
              <span class="ix-num ix-up">{{ zero(row.price, baseCoinScale) }}</span>
              <span class="ix-num">{{ zero(row.amount, coinScale) }}</span>
              <span class="ix-num ix-dim">{{ zero(row.totalAmount, coinScale) }}</span>
            </button>
          </div>
        </div>

        <div class="ix-rail-body" v-show="railTab === 'trades'">
          <div class="ix-thead ix-thead-trades">
            <span>Time</span>
            <span class="ix-num">Price</span>
            <span class="ix-num">Amount</span>
          </div>
          <div class="ix-scroll">
            <p class="ix-empty" v-if="trades.length === 0">No trades yet</p>
            <div class="ix-trade-row" v-for="(row, i) in trades" :key="'t' + i">
              <span class="ix-dim">{{ time(row.time) }}</span>
              <span class="ix-num" :class="row.direction === 'BUY' ? 'ix-up' : 'ix-down'">
                {{ fmt(row.price, baseCoinScale) }}
              </span>
              <span class="ix-num">{{ fmt(row.amount, coinScale) }}</span>
            </div>
          </div>
        </div>
      </aside>

      <!-- ── order entry ──────────────────────────────────────────────── -->
      <aside class="ix-panel ix-order">
        <div class="ix-side-toggle">
          <button
            type="button"
            :class="{ 'is-active': side === 'BUY' }"
            @click="setSide('BUY')"
          >Buy</button>
          <button
            type="button"
            :class="{ 'is-active': side === 'SELL' }"
            @click="setSide('SELL')"
          >Sell</button>
        </div>

        <nav class="ix-tabs ix-tabs-sm ix-type-tabs">
          <button
            type="button"
            :class="{ 'is-active': orderType === 'LIMIT_PRICE' }"
            @click="setOrderType('LIMIT_PRICE')"
          >Limit</button>
          <button
            type="button"
            :class="{ 'is-active': orderType === 'MARKET_PRICE' }"
            @click="setOrderType('MARKET_PRICE')"
          >Market</button>
        </nav>

        <div class="ix-order-body">
          <div class="ix-field">
            <label>Price</label>
            <div class="ix-input" :class="{ 'is-disabled': orderType === 'MARKET_PRICE' }">
              <input
                type="text"
                inputmode="decimal"
                spellcheck="false"
                :disabled="orderType === 'MARKET_PRICE'"
                :placeholder="orderType === 'MARKET_PRICE' ? 'Best available' : '0.00'"
                v-model="form.price"
                @input="onPriceInput"
              />
              <span class="ix-unit">{{ currentCoin.base }}</span>
            </div>
          </div>

          <div class="ix-field">
            <label>{{ amountLabel }}</label>
            <div class="ix-input">
              <input
                type="text"
                inputmode="decimal"
                spellcheck="false"
                placeholder="0.00"
                v-model="form.amount"
                @input="onAmountInput"
              />
              <span class="ix-unit">{{ amountUnit }}</span>
            </div>
          </div>

          <div class="ix-slider">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              v-model.number="percent"
              :disabled="!canSize"
              @input="applyPercent"
            />
            <div class="ix-slider-steps">
              <button
                type="button"
                v-for="p in [25, 50, 75, 100]"
                :key="p"
                :class="{ 'is-active': percent === p }"
                :disabled="!canSize"
                @click="setPercent(p)"
              >{{ p }}%</button>
            </div>
          </div>

          <dl class="ix-meta">
            <div>
              <dt>Available</dt>
              <dd>{{ fmt(availableBalance, side === 'BUY' ? baseCoinScale : coinScale) }}
                <em>{{ side === 'BUY' ? currentCoin.base : currentCoin.coin }}</em>
              </dd>
            </div>
            <div v-if="orderType === 'LIMIT_PRICE'">
              <dt>Order value</dt>
              <dd>{{ fmt(orderValue, baseCoinScale) }} <em>{{ currentCoin.base }}</em></dd>
            </div>
            <div>
              <dt>Fee</dt>
              <dd>{{ feeLabel }}</dd>
            </div>
          </dl>

          <button
            type="button"
            class="ix-submit"
            :class="side === 'BUY' ? 'is-buy' : 'is-sell'"
            :disabled="!tradable"
            @click="submitOrder"
          >
            {{ submitLabel }}
          </button>

          <p class="ix-order-note" v-if="!isLogin">
            <router-link to="/login">Sign in</router-link> or
            <router-link to="/register">register</router-link> to trade.
          </p>
          <p class="ix-order-note" v-else-if="exchangeable != 1">This market is halted.</p>
          <p class="ix-order-note" v-else-if="orderType === 'MARKET_PRICE' && !marketAllowed">
            Market {{ side === 'BUY' ? 'buy' : 'sell' }} is disabled for this pair.
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<script>
/* ============================================================================
   INTAFACED — spot trading terminal
   ----------------------------------------------------------------------------
   THE AUTO-SCROLL BUG

   The vendor built the TradingView widget with `fullscreen: true`. In
   charting_library.min.js that flag drives:

       _autoResizeChart: function () {
         this.options.fullscreen && (gEl(this.id).style.height = window.innerHeight + 'px')
       }

   which runs on create and again from a `resize` listener on window. So the
   chart iframe was forced to the full viewport height inside a 350px
   `overflow: hidden` box: the visible slice was the top third of a chart laid
   out for a 900px canvas, and the rest — time axis, most of the candles —
   sat below the clip, i.e. scrolled off the screen. `fullscreen` also
   suppresses the `height: 100%` that `autosize` would otherwise set, so the
   iframe never tracked its container.

   Two things made it worse and are fixed here too:

     * getKline() ran inside the STOMP connect callback, and the callback fires
       again on every reconnect. Each call did `container.innerHTML = iframe`
       and registered ANOTHER window resize listener, none of which were ever
       removed (widget.remove() was never called). After a few reconnects
       several stale handlers were each re-stretching the iframe.
     * the depth chart's hover handler assigned `canvas.height = 500` on every
       mousemove, which resizes the canvas element itself. See DepthGraph.vue.

   The widget is now created once per symbol with `autosize: true` and no
   `fullscreen`, into a container with a definite height, and is torn down with
   widget.remove() before any re-create and on destroy.

   DEGRADATION

   Every request goes through request(), which resolves to null instead of
   rejecting. A backend that is down yields empty states, not a console full of
   unhandled rejections, and the chart still renders its frame because the
   datafeed answers getBars with { noData: true } rather than an error.
   ========================================================================== */
import Datafeeds from '@js/charting_library/datafeed/bitrade.js';
import DepthGraph from '@components/exchange/DepthGraph.vue';

var Stomp = require('stompjs');
var SockJS = require('sockjs-client');
var moment = require('moment');

const BOOK_DEPTH = 14;
const TRADE_LIMIT = 40;
const DEPTH_REDRAW_MS = 1000;

export default {
  components: { DepthGraph },
  data() {
    return {
      defaultPair: 'btc_usdt',

      currentCoin: { base: '', coin: '', symbol: '', close: 0, rose: '', high: 0, low: 0, volume: 0 },
      currentCoinIsFavor: false,
      coinInfo: {},
      coinScale: 6,
      baseCoinScale: 6,
      symbolFee: 0.001,
      enableMarketBuy: 1,
      enableMarketSell: 1,
      exchangeable: 1,
      CNYRate: null,

      markets: [],
      marketMap: {},
      baseFilter: 'USDT',
      searchKey: '',

      mainTab: 'chart',
      mainTabs: [
        { id: 'chart', label: 'Chart' },
        { id: 'depth', label: 'Depth' },
        { id: 'book', label: 'Order Book' },
        { id: 'trades', label: 'Trades' }
      ],
      railTab: 'book',
      bookMode: 'all',
      bookModes: [
        { id: 'all', label: 'Bids and asks' },
        { id: 'bids', label: 'Bids only' },
        { id: 'asks', label: 'Asks only' }
      ],
      accountTab: 'balances',

      interval: '60',
      intervals: [
        { label: '1m', value: '1' },
        { label: '5m', value: '5' },
        { label: '15m', value: '15' },
        { label: '30m', value: '30' },
        { label: '1H', value: '60' },
        { label: '1D', value: '1D' },
        { label: '1W', value: '1W' }
      ],
      chartFailed: false,
      feedLive: false,

      plate: { asks: [], bids: [], askTotal: 0, bidTotal: 0 },
      trades: [],
      openOrders: [],
      historyOrders: [],
      wallet: { base: 0, coin: 0 },

      side: 'BUY',
      orderType: 'LIMIT_PRICE',
      percent: 0,
      form: { price: '', amount: '' },

      trend: 0,
      submitting: false
    };
  },

  computed: {
    isLogin() {
      return this.$store.getters.isLogin;
    },
    member() {
      return this.$store.getters.member;
    },
    lastPrice() {
      return this.num(this.currentCoin.close);
    },
    trendClass() {
      const chg = this.num(this.currentCoin.chg);
      return chg > 0 ? 'ix-up' : chg < 0 ? 'ix-down' : '';
    },
    fiatValue() {
      if (!this.CNYRate || !this.currentCoin.usdRate) {
        return '';
      }
      return this.fmt(this.num(this.currentCoin.usdRate) * this.num(this.CNYRate), 2);
    },
    /* Asks are held best-last so the rail can render them top-down away from
       the spread, the way every book on the market reads. */
    asks() {
      return this.plate.asks.slice(-BOOK_DEPTH);
    },
    asksAscending() {
      return this.plate.asks.slice().reverse();
    },
    bids() {
      return this.plate.bids.slice(0, BOOK_DEPTH);
    },
    spread() {
      const bestAsk = this.plate.asks.length ? this.num(this.plate.asks[this.plate.asks.length - 1].price) : 0;
      const bestBid = this.plate.bids.length ? this.num(this.plate.bids[0].price) : 0;
      if (bestAsk <= 0 || bestBid <= 0) {
        return null;
      }
      return this.fmt(bestAsk - bestBid, this.baseCoinScale);
    },
    visibleMarkets() {
      const key = this.searchKey.trim().toUpperCase();
      let rows;
      if (this.baseFilter === 'favor') {
        rows = this.markets.filter(r => r.isFavor);
      } else {
        rows = this.markets.filter(r => r.base === this.baseFilter);
      }
      if (key) {
        rows = rows.filter(r => (r.coin || '').indexOf(key) === 0);
      }
      return rows;
    },
    balanceRows() {
      return [
        {
          unit: this.currentCoin.base,
          balance: this.wallet.base,
          scale: this.baseCoinScale,
          valueLabel: '—'
        },
        {
          unit: this.currentCoin.coin,
          balance: this.wallet.coin,
          scale: this.coinScale,
          valueLabel: this.lastPrice
            ? this.fmt(this.num(this.wallet.coin) * this.lastPrice, 2) + ' ' + this.currentCoin.base
            : '—'
        }
      ];
    },
    fills() {
      const out = [];
      this.historyOrders.forEach(order => {
        (order.detail || []).forEach(d => {
          out.push({
            time: d.time,
            symbol: order.symbol,
            direction: order.direction,
            price: d.price,
            amount: d.amount,
            turnover: d.turnover,
            fee: d.fee
          });
        });
      });
      return out;
    },
    accountTabs() {
      return [
        { id: 'balances', label: 'Balances' },
        { id: 'positions', label: 'Positions' },
        { id: 'open', label: 'Open Orders', count: this.openOrders.length },
        { id: 'fills', label: 'Trade History' },
        { id: 'history', label: 'Order History' }
      ];
    },
    accountTabEmpty() {
      if (this.accountTab === 'open') return this.openOrders.length === 0;
      if (this.accountTab === 'fills') return this.fills.length === 0;
      if (this.accountTab === 'history') return this.historyOrders.length === 0;
      return false;
    },
    availableBalance() {
      return this.side === 'BUY' ? this.num(this.wallet.base) : this.num(this.wallet.coin);
    },
    /* Market buys are sized in the quote asset, everything else in the base. */
    quoteSized() {
      return this.orderType === 'MARKET_PRICE' && this.side === 'BUY';
    },
    amountLabel() {
      return this.quoteSized ? 'Total' : 'Amount';
    },
    amountUnit() {
      return this.quoteSized ? this.currentCoin.base : this.currentCoin.coin;
    },
    orderValue() {
      if (this.quoteSized) {
        return this.num(this.form.amount);
      }
      return this.num(this.form.price) * this.num(this.form.amount);
    },
    canSize() {
      return this.isLogin && this.availableBalance > 0 &&
        (this.orderType === 'MARKET_PRICE' || this.num(this.form.price) > 0);
    },
    marketAllowed() {
      return this.side === 'BUY' ? this.enableMarketBuy == 1 : this.enableMarketSell == 1;
    },
    tradable() {
      if (!this.isLogin || this.submitting) return false;
      if (this.exchangeable != 1) return false;
      if (this.orderType === 'MARKET_PRICE' && !this.marketAllowed) return false;
      return true;
    },
    submitLabel() {
      const verb = this.side === 'BUY' ? 'Buy' : 'Sell';
      return this.currentCoin.coin ? verb + ' ' + this.currentCoin.coin : verb;
    },
    feeLabel() {
      return (this.num(this.symbolFee) * 100).toFixed(2) + '%';
    }
  },

  watch: {
    $route() {
      this.init();
    },
    isLogin(value) {
      if (value) {
        this.loadAccount();
      } else {
        this.openOrders = [];
        this.historyOrders = [];
        this.wallet = { base: 0, coin: 0 };
      }
    },
    'currentCoin.close': function (value) {
      const next = this.num(value);
      if (this.lastTick && next !== this.lastTick) {
        this.trend = next > this.lastTick ? 1 : -1;
      }
      this.lastTick = next;
    }
  },

  created() {
    /* Deliberately NOT in data(). Vue would deep-observe these, and
       isPlainObject() is true for class instances — it would walk the STOMP
       client into its SockJS transport and the TradingView widget into its
       iframe handles, defining accessors all the way down. None of them are
       rendered, so none of them need to be reactive. */
    this.stompClient = null;
    this.datafeed = null;
    this.tvWidget = null;
    this.depthTimer = 0;
    this.depthPending = false;
    this.lastTick = 0;

    this.init();
  },

  beforeDestroy() {
    this.teardown();
  },

  methods: {
    /* ── plumbing ──────────────────────────────────────────────────────── */

    /* Never rejects. A dead backend produces null, and every caller treats
       null as "leave the current state alone". */
    request(path, params) {
      return this.$http.post(this.host + path, params || {}).then(
        response => (response && response.body) || null,
        () => null
      );
    },

    init() {
      const pair = this.$route.params.pair;
      if (!pair) {
        this.$router.replace('/exchange/' + this.defaultPair);
        return;
      }

      const parts = pair.toUpperCase().split('_');
      const coin = parts[0];
      const base = parts[1] || 'USDT';

      this.teardown();

      this.currentCoin = Object.assign({}, this.currentCoin, {
        coin,
        base,
        symbol: coin + '/' + base
      });
      this.baseFilter = base;
      this.trend = 0;
      this.lastTick = 0;
      this.chartFailed = false;
      this.plate = { asks: [], bids: [], askTotal: 0, bidTotal: 0 };
      this.trades = [];
      this.percent = 0;
      this.form = { price: '', amount: '' };

      this.$store.commit('navigate', 'nav-exchange');
      this.$store.commit('setSkin', 'night');

      this.getCNYRate();
      this.getCoinInfo();
      this.getMarkets();
      this.getPlate();
      this.getTrades();
      if (this.isLogin) {
        this.loadAccount();
      }

      /* The chart needs the price scale, so it waits for symbol-info — but
         only once, and it starts even when that request fails. */
      this.getSymbolScale().then(() => {
        this.startWebsock();
        this.$nextTick(() => this.mountChart());
      });
    },

    teardown() {
      this.destroyChart();
      this.stopWebsock();
      clearTimeout(this.depthTimer);
      this.depthTimer = 0;
      this.depthPending = false;
    },

    loadAccount() {
      this.getWallet();
      this.getOpenOrders();
      this.getHistoryOrders();
    },

    /* ── chart ─────────────────────────────────────────────────────────── */

    mountChart() {
      const host = document.getElementById('ix_kline');
      if (!host) {
        return;
      }
      this.destroyChart();

      this.datafeed = new Datafeeds.WebsockFeed(
        this.host + '/market',
        { symbol: this.currentCoin.symbol },
        this.stompClient,
        this.baseCoinScale
      );

      const config = this.chartConfig();
      const self = this;
      require(['@js/charting_library/charting_library.min.js'], function () {
        if (!window.TradingView || self._isDestroyed) {
          self.chartFailed = true;
          return;
        }
        try {
          const widget = new window.TradingView.widget(config);
          self.tvWidget = widget;
          window.tvWidget = widget;
          widget.onChartReady(function () {
            try {
              widget.chart().createStudy('Moving Average', false, false, [7], null, {
                'plot.color': '#ff6b00'
              });
              widget.chart().createStudy('Moving Average', false, false, [25], null, {
                'plot.color': '#ff8534'
              });
              widget.chart().createStudy('Moving Average', false, false, [99], null, {
                'plot.color': '#9a9a9a'
              });
            } catch (e) {
              /* studies are decoration; a datafeed with no history can refuse
                 them without costing us the chart */
            }
          });
        } catch (e) {
          self.chartFailed = true;
        }
      });
    },

    chartConfig() {
      return {
        /* autosize only. `fullscreen` is what forced the iframe to
           window.innerHeight — the auto-scroll bug. Do not put it back. */
        autosize: true,
        symbol: this.currentCoin.symbol,
        interval: this.interval,
        timezone: 'Etc/UTC',
        toolbar_bg: '#000000',
        container_id: 'ix_kline',
        datafeed: this.datafeed,
        /* ABSOLUTE, and it has to be. The library builds the iframe src as
           library_path + 'static/tv-chart…html'; with a relative value the
           browser resolves it against the current route, so on
           /exchange/btc_usdt it asked for /exchange/src/assets/… and got the
           API's 404 JSON instead of the chart. Dev serves the repo from the
           dev-server root; the prod paths follow CopyWebpackPlugin
           (src/assets/js/charting_library/static -> assets/charting_library/
           static) under build.assetsPublicPath '/static/'. */
        library_path:
          process.env.NODE_ENV === 'production'
            ? '/static/assets/charting_library/'
            : '/src/assets/js/charting_library/',
        locale: 'en',
        debug: false,
        client_id: 'intafaced',
        user_id: 'public',
        custom_css_url: 'bundles/common.css',
        disabled_features: [
          'header_resolutions',
          'timeframes_toolbar',
          'header_symbol_search',
          'header_compare',
          'header_undo_redo',
          'header_screenshot',
          'header_saveload',
          'use_localstorage_for_settings',
          'left_toolbar',
          'volume_force_overlay',
          'border_around_the_chart',
          'control_bar'
        ],
        enabled_features: ['hide_last_na_study_output', 'move_logo_to_main_pane'],
        overrides: {
          'paneProperties.background': '#000000',
          'paneProperties.vertGridProperties.color': 'rgba(255,255,255,0.035)',
          'paneProperties.horzGridProperties.color': 'rgba(255,255,255,0.035)',
          'paneProperties.crossHairProperties.color': '#ff6b00',
          'paneProperties.legendProperties.showLegend': false,
          'paneProperties.topMargin': 12,
          'paneProperties.bottomMargin': 8,

          'scalesProperties.textColor': '#6b6b6b',
          'scalesProperties.lineColor': 'rgba(255,255,255,0.09)',
          'scalesProperties.backgroundColor': '#000000',
          'scalesProperties.showLeftScale': false,

          'mainSeriesProperties.candleStyle.upColor': '#00b275',
          'mainSeriesProperties.candleStyle.downColor': '#ff4a68',
          'mainSeriesProperties.candleStyle.borderUpColor': '#00b275',
          'mainSeriesProperties.candleStyle.borderDownColor': '#ff4a68',
          'mainSeriesProperties.candleStyle.wickUpColor': '#00b275',
          'mainSeriesProperties.candleStyle.wickDownColor': '#ff4a68',
          'mainSeriesProperties.candleStyle.drawBorder': false,

          'mainSeriesProperties.hollowCandleStyle.upColor': '#00b275',
          'mainSeriesProperties.hollowCandleStyle.downColor': '#ff4a68',
          'mainSeriesProperties.hollowCandleStyle.borderUpColor': '#00b275',
          'mainSeriesProperties.hollowCandleStyle.borderDownColor': '#ff4a68',

          'mainSeriesProperties.barStyle.upColor': '#00b275',
          'mainSeriesProperties.barStyle.downColor': '#ff4a68',

          'mainSeriesProperties.lineStyle.color': '#ff6b00',
          'mainSeriesProperties.areaStyle.color1': 'rgba(255,107,0,0.30)',
          'mainSeriesProperties.areaStyle.color2': 'rgba(255,107,0,0.02)',
          'mainSeriesProperties.areaStyle.linecolor': '#ff6b00',

          volumePaneSize: 'small'
        },
        studies_overrides: {
          'volume.volume.color.0': 'rgba(255,74,104,0.45)',
          'volume.volume.color.1': 'rgba(0,178,117,0.45)',
          'volume.volume.transparency': 55
        },
        time_frames: []
      };
    },

    destroyChart() {
      if (this.tvWidget) {
        try {
          /* remove() also detaches the widget's own window resize listener —
             the leak that let stale iframes keep resizing themselves. */
          this.tvWidget.remove();
        } catch (e) {
          const host = document.getElementById('ix_kline');
          if (host) {
            host.innerHTML = '';
          }
        }
        this.tvWidget = null;
        if (window.tvWidget) {
          window.tvWidget = null;
        }
      }
      if (this.datafeed) {
        this.datafeed.dispose();
        this.datafeed = null;
      }
    },

    setChartInterval(value) {
      this.interval = value;
      if (!this.tvWidget) {
        return;
      }
      try {
        this.tvWidget.chart().setResolution(value);
      } catch (e) {
        /* the chart is not ready yet; the next mount picks the value up */
      }
    },

    selectMainTab(id) {
      this.mainTab = id;
      if (id === 'depth') {
        this.$nextTick(() => {
          if (this.$refs.depthGraph) {
            this.$refs.depthGraph.measure();
          }
          this.getPlateFull();
        });
      }
    },

    /* ── market data ───────────────────────────────────────────────────── */

    getCNYRate() {
      this.request('/market/exchange-rate/usd-cny').then(body => {
        if (body && body.data) {
          this.CNYRate = body.data;
        }
      });
    },

    getCoinInfo() {
      this.request(this.api.market.coinInfo, { unit: this.currentCoin.coin }).then(body => {
        this.coinInfo = body || {};
      });
    },

    getSymbolScale() {
      return this.request(this.api.market.symbolInfo, { symbol: this.currentCoin.symbol }).then(body => {
        if (!body) {
          return;
        }
        this.baseCoinScale = body.baseCoinScale != null ? body.baseCoinScale : this.baseCoinScale;
        this.coinScale = body.coinScale != null ? body.coinScale : this.coinScale;
        this.symbolFee = body.fee != null ? body.fee : this.symbolFee;
        this.enableMarketBuy = body.enableMarketBuy;
        this.enableMarketSell = body.enableMarketSell;
        this.exchangeable = body.exchangeable;
      });
    },

    getMarkets() {
      this.request(this.api.market.thumb).then(body => {
        if (!Array.isArray(body)) {
          return;
        }
        const map = {};
        const rows = body.map(item => {
          const coin = (item.symbol || '').split('/')[0];
          const base = (item.symbol || '').split('/')[1];
          const chg = this.num(item.chg);
          /* Declare every key the thumb topic will later write, so the
             websocket can mutate rows in place and stay reactive. */
          const row = Object.assign(
            { close: 0, high: 0, low: 0, volume: 0, usdRate: 0 },
            item,
            {
              coin,
              base,
              chg,
              rose: (chg > 0 ? '+' : '') + (chg * 100).toFixed(2) + '%',
              href: (coin + '_' + base).toLowerCase(),
              isFavor: false
            }
          );
          map[row.symbol] = row;
          return row;
        });
        this.markets = rows;
        this.marketMap = map;

        const current = map[this.currentCoin.symbol];
        if (current) {
          this.currentCoin = Object.assign({}, this.currentCoin, current);
          if (!this.form.price) {
            this.form.price = this.fmt(current.close, this.baseCoinScale);
          }
        }
        if (this.isLogin) {
          this.getFavorites();
        }
      });
    },

    getFavorites() {
      this.request(this.api.exchange.favorFind).then(body => {
        if (!Array.isArray(body)) {
          return;
        }
        this.currentCoinIsFavor = false;
        body.forEach(item => {
          const row = this.marketMap[item.symbol];
          if (row) {
            row.isFavor = true;
          }
          if (item.symbol === this.currentCoin.symbol) {
            this.currentCoinIsFavor = true;
          }
        });
        this.markets = this.markets.slice();
      });
    },

    getPlate() {
      this.request(this.api.market.platemini, { symbol: this.currentCoin.symbol }).then(body => {
        if (!body) {
          return;
        }
        this.applyPlate('SELL', (body.ask && body.ask.items) || []);
        this.applyPlate('BUY', (body.bid && body.bid.items) || []);
      });
    },

    /* One shape for both the REST snapshot and the websocket delta, so the
       book cannot drift between the two sources. Asks are stored best-last. */
    applyPlate(direction, items) {
      let total = 0;
      const rows = items.slice(0, BOOK_DEPTH).map(item => {
        total += this.num(item.amount);
        return {
          price: this.num(item.price),
          amount: this.num(item.amount),
          totalAmount: total
        };
      });
      if (direction === 'SELL') {
        this.plate.asks = rows.reverse();
        this.plate.askTotal = total;
      } else {
        this.plate.bids = rows;
        this.plate.bidTotal = total;
      }
    },

    /* Throttled: the plate topic fires several times a second and the full
       plate is a separate round trip plus a canvas repaint. */
    getPlateFull() {
      if (this.mainTab !== 'depth') {
        return;
      }
      if (this.depthTimer) {
        this.depthPending = true;
        return;
      }
      this.depthTimer = setTimeout(() => {
        this.depthTimer = 0;
        if (this.depthPending) {
          this.depthPending = false;
          this.getPlateFull();
        }
      }, DEPTH_REDRAW_MS);

      this.request(this.api.market.platefull, { symbol: this.currentCoin.symbol }).then(body => {
        if (this.$refs.depthGraph) {
          this.$refs.depthGraph.draw(body || {});
        }
      });
    },

    getTrades() {
      this.request(this.api.market.trade, { symbol: this.currentCoin.symbol, size: TRADE_LIMIT }).then(body => {
        this.trades = Array.isArray(body) ? body.slice(0, TRADE_LIMIT) : [];
      });
    },

    /* ── websocket ─────────────────────────────────────────────────────── */

    startWebsock() {
      this.stopWebsock();
      const self = this;
      let socket;
      try {
        socket = new SockJS(this.host + this.api.market.ws);
      } catch (e) {
        this.feedLive = false;
        return;
      }

      const client = Stomp.over(socket);
      client.debug = null;
      /* No heartbeat and no auto-reconnect: against a dead host the vendor
         default produced a reconnect loop and a wall of console noise. */
      client.heartbeat.outgoing = 0;
      client.heartbeat.incoming = 0;
      this.stompClient = client;

      client.connect(
        {},
        function () {
          if (self.stompClient !== client) {
            return;
          }
          self.feedLive = true;
          if (self.datafeed) {
            self.datafeed.attach(client);
          }
          self.subscribeTopics(client);
        },
        function () {
          if (self.stompClient === client) {
            self.feedLive = false;
          }
        }
      );
    },

    stopWebsock() {
      this.feedLive = false;
      const client = this.stompClient;
      this.stompClient = null;
      if (!client) {
        return;
      }
      try {
        if (client.connected) {
          client.disconnect();
        } else if (client.ws) {
          client.ws.close();
        }
      } catch (e) {
        /* the socket never opened */
      }
    },

    subscribeTopics(client) {
      const self = this;
      const symbol = this.currentCoin.symbol;

      const on = (topic, handler) => {
        try {
          client.subscribe(topic, function (msg) {
            let payload;
            try {
              payload = JSON.parse(msg.body);
            } catch (e) {
              return;
            }
            handler(payload);
          });
        } catch (e) {
          /* a topic the backend does not publish is not fatal */
        }
      };

      on('/topic/market/thumb', resp => {
        /* Every pair publishes here. Rows are mutated in place — the keys were
           all present when getMarkets() built them, so they are reactive and
           only the changed cells repaint. Re-assigning this.markets would
           re-render the whole list dozens of times a second. */
        const row = self.marketMap[resp.symbol];
        if (row) {
          Object.assign(row, {
            close: resp.close,
            high: resp.high,
            low: resp.low,
            volume: resp.volume,
            usdRate: resp.usdRate,
            chg: resp.chg,
            rose: (resp.chg > 0 ? '+' : '') + (resp.chg * 100).toFixed(2) + '%'
          });
        }
        if (resp.symbol === symbol) {
          self.currentCoin = Object.assign({}, self.currentCoin, {
            close: resp.close,
            high: resp.high,
            low: resp.low,
            volume: resp.volume,
            usdRate: resp.usdRate,
            chg: resp.chg,
            rose: (resp.chg > 0 ? '+' : '') + (resp.chg * 100).toFixed(2) + '%'
          });
        }
      });

      on('/topic/market/trade/' + symbol, resp => {
        if (!resp || !resp.length) {
          return;
        }
        /* Bounded list. The vendor pushed unbounded then trimmed; this keeps
           the DOM row count fixed so the panel never grows the page. */
        self.trades = resp.concat(self.trades).slice(0, TRADE_LIMIT);
      });

      on('/topic/market/trade-plate/' + symbol, resp => {
        self.applyPlate(resp.direction, resp.items || []);
        self.getPlateFull();
      });

      if (this.isLogin && this.member) {
        const id = this.member.id;
        ['order-canceled', 'order-completed', 'order-trade'].forEach(kind => {
          on('/topic/market/' + kind + '/' + symbol + '/' + id, () => self.loadAccount());
        });
      }
    },

    /* ── account ───────────────────────────────────────────────────────── */

    getWallet() {
      this.request(this.api.uc.wallet + this.currentCoin.base).then(body => {
        if (body && body.data) {
          this.wallet.base = body.data.balance || 0;
        }
      });
      this.request(this.api.uc.wallet + this.currentCoin.coin).then(body => {
        if (body && body.data) {
          this.wallet.coin = body.data.balance || 0;
        }
      });
    },

    getOpenOrders() {
      this.request(this.api.exchange.current, {
        pageNo: 0,
        pageSize: 100,
        symbol: this.currentCoin.symbol
      }).then(body => {
        this.openOrders = (body && body.content) || [];
      });
    },

    getHistoryOrders() {
      this.request(this.api.exchange.history, {
        pageNo: 0,
        pageSize: 30,
        symbol: this.currentCoin.symbol
      }).then(body => {
        this.historyOrders = (body && body.content) || [];
      });
    },

    /* ── interactions ──────────────────────────────────────────────────── */

    openPair(row) {
      if (!row || row.symbol === this.currentCoin.symbol) {
        return;
      }
      this.$router.push({ name: 'ExchangePair', params: { pair: row.href } });
    },

    useBookPrice(row) {
      const price = this.num(row.price);
      if (price <= 0) {
        return;
      }
      this.orderType = 'LIMIT_PRICE';
      this.form.price = this.fmt(price, this.baseCoinScale);
      this.applyPercent();
    },

    setSide(side) {
      this.side = side;
      this.percent = 0;
      this.form.amount = '';
    },

    setOrderType(type) {
      this.orderType = type;
      this.percent = 0;
      this.form.amount = '';
    },

    setPercent(value) {
      this.percent = value;
      this.applyPercent();
    },

    applyPercent() {
      if (!this.canSize || this.percent <= 0) {
        if (this.percent <= 0) {
          this.form.amount = '';
        }
        return;
      }
      const budget = (this.availableBalance * this.percent) / 100;
      if (this.quoteSized) {
        this.form.amount = this.floor(budget, this.baseCoinScale);
        return;
      }
      if (this.side === 'SELL') {
        this.form.amount = this.floor(budget, this.coinScale);
        return;
      }
      const price = this.num(this.form.price);
      this.form.amount = price > 0 ? this.floor(budget / price, this.coinScale) : '';
    },

    onPriceInput() {
      this.form.price = this.clamp(this.form.price, this.baseCoinScale);
      if (this.percent > 0) {
        this.applyPercent();
      }
    },

    onAmountInput() {
      this.form.amount = this.clamp(this.form.amount, this.quoteSized ? this.baseCoinScale : this.coinScale);
      this.percent = 0;
    },

    submitOrder() {
      if (!this.tradable) {
        return;
      }
      const amount = this.num(this.form.amount);
      const price = this.num(this.form.price);

      if (amount <= 0) {
        return this.warn('Enter an amount.');
      }
      if (this.orderType === 'LIMIT_PRICE' && price <= 0) {
        return this.warn('Enter a price.');
      }

      const cost = this.quoteSized ? amount : this.side === 'BUY' ? price * amount : amount;
      if (cost > this.availableBalance) {
        return this.warn('Insufficient balance. Available ' + this.fmt(this.availableBalance, 8) + '.');
      }

      this.submitting = true;
      this.request(this.api.exchange.orderAdd, {
        symbol: this.currentCoin.symbol,
        price: this.orderType === 'MARKET_PRICE' ? 0 : price,
        amount,
        direction: this.side,
        type: this.orderType,
        useDiscount: '0'
      }).then(body => {
        this.submitting = false;
        if (!body) {
          return this.warn('The exchange did not respond. Your order was not placed.');
        }
        if (body.code == 0) {
          this.$Notice.success({ title: 'Order placed', desc: this.submitLabel });
          this.form.amount = '';
          this.percent = 0;
          this.accountTab = 'open';
          this.loadAccount();
        } else {
          this.$Notice.error({ title: 'Order rejected', desc: body.message || 'Unknown error' });
        }
      });
    },

    cancelOrder(order) {
      this.$Modal.confirm({
        title: 'Cancel order',
        content: 'Cancel this order?',
        onOk: () => {
          this.request(this.api.exchange.orderCancel + '/' + order.orderId).then(body => {
            if (body && body.code == 0) {
              this.$Notice.success({ title: 'Order cancelled', desc: order.symbol });
              this.loadAccount();
            } else {
              this.$Notice.error({
                title: 'Cancel failed',
                desc: (body && body.message) || 'The exchange did not respond.'
              });
            }
          });
        }
      });
    },

    toggleFavorite() {
      if (!this.isLogin) {
        return this.warn('Sign in first.');
      }
      const symbol = this.currentCoin.symbol;
      const path = this.currentCoinIsFavor ? this.api.exchange.favorDelete : this.api.exchange.favorAdd;
      const next = !this.currentCoinIsFavor;
      this.request(path, { symbol }).then(body => {
        if (body && body.code == 0) {
          this.currentCoinIsFavor = next;
          const row = this.marketMap[symbol];
          if (row) {
            row.isFavor = next;
            this.markets = this.markets.slice();
          }
        }
      });
    },

    toggleRowFavorite(row) {
      if (!this.isLogin) {
        return this.warn('Sign in first.');
      }
      const path = row.isFavor ? this.api.exchange.favorDelete : this.api.exchange.favorAdd;
      const next = !row.isFavor;
      this.request(path, { symbol: row.symbol }).then(body => {
        if (body && body.code == 0) {
          row.isFavor = next;
          if (row.symbol === this.currentCoin.symbol) {
            this.currentCoinIsFavor = next;
          }
          this.markets = this.markets.slice();
        }
      });
    },

    warn(message) {
      this.$Message.warning(message);
    },

    /* ── formatting ────────────────────────────────────────────────────── */

    num(value) {
      const n = parseFloat(value);
      return isFinite(n) ? n : 0;
    },

    fmt(value, scale) {
      const n = parseFloat(value);
      if (!isFinite(n)) {
        return '—';
      }
      return n.toFixed(scale == null ? 2 : scale);
    },

    /* Book rows are padded with zero-price placeholders so the ladder keeps a
       constant height; those render as a dash, not as 0.000000. */
    zero(value, scale) {
      const n = parseFloat(value);
      if (!isFinite(n) || n === 0) {
        return '—';
      }
      return n.toFixed(scale);
    },

    floor(value, scale) {
      const n = parseFloat(value);
      if (!isFinite(n) || n <= 0) {
        return '';
      }
      const factor = Math.pow(10, scale);
      return (Math.floor(n * factor) / factor).toFixed(scale);
    },

    clamp(value, scale) {
      let text = String(value == null ? '' : value).replace(/[^\d.]/g, '');
      const first = text.indexOf('.');
      if (first > -1) {
        text = text.slice(0, first + 1) + text.slice(first + 1).replace(/\./g, '');
        text = text.slice(0, first + 1 + scale);
      }
      return text;
    },

    barWidth(row, side) {
      const total = side === 'bid' ? this.plate.bidTotal : this.plate.askTotal;
      if (!total || !row.totalAmount) {
        return '0%';
      }
      return Math.min(100, (row.totalAmount / total) * 100).toFixed(2) + '%';
    },

    roseClass(rose) {
      if (!rose) {
        return '';
      }
      return parseFloat(rose) < 0 ? 'ix-down' : parseFloat(rose) > 0 ? 'ix-up' : '';
    },

    priceLabel(row) {
      return row.type === 'MARKET_PRICE' ? 'Market' : this.fmt(row.price, this.baseCoinScale);
    },

    statusLabel(status) {
      if (status === 'COMPLETED') return 'Filled';
      if (status === 'CANCELED') return 'Cancelled';
      if (status === 'TRADING') return 'Open';
      return status || '—';
    },

    statusClass(status) {
      if (status === 'COMPLETED') return 'ix-accent';
      if (status === 'CANCELED') return 'ix-dim';
      return '';
    },

    time(tick) {
      return tick ? moment(tick).format('HH:mm:ss') : '—';
    },

    date(tick) {
      return tick ? moment(tick).format('MM-DD HH:mm:ss') : '—';
    }
  }
};
</script>

<style scoped lang="scss">
/* Palette comes from assets/css/intafaced.css. Fallbacks keep the terminal
   readable if this page is ever rendered before that sheet loads. */
$orange: var(--ix-orange, #ff6b00);
$up: var(--ix-up, #00b275);
$down: var(--ix-down, #ff4a68);
$text: var(--ix-text, #f2f2f2);
$dim: var(--ix-text-dim, #9a9a9a);
$faint: var(--ix-text-faint, #6b6b6b);
$hair: var(--ix-hairline, rgba(255, 255, 255, 0.09));
$surface: var(--ix-surface, rgba(255, 255, 255, 0.045));
$radius: var(--ix-radius, 14px);
$radius-sm: var(--ix-radius-sm, 8px);

.ix-terminal {
  --row: 22px;
  padding: 8px;
  color: $text;
  font-size: 12px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}

/* ── shared surface ───────────────────────────────────────────────────── */
.ix-panel {
  background: $surface;
  backdrop-filter: var(--ix-blur, saturate(180%) blur(20px));
  -webkit-backdrop-filter: var(--ix-blur, saturate(180%) blur(20px));
  border: 1px solid $hair;
  border-radius: $radius;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* ── header ───────────────────────────────────────────────────────────── */
.ix-head {
  display: flex;
  align-items: center;
  gap: 26px;
  padding: 10px 18px;
  margin-bottom: 8px;
  background: $surface;
  backdrop-filter: var(--ix-blur, saturate(180%) blur(20px));
  -webkit-backdrop-filter: var(--ix-blur, saturate(180%) blur(20px));
  border: 1px solid $hair;
  border-radius: $radius;
  overflow-x: auto;
}

.ix-head-pair {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.ix-pair {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.ix-pair-base {
  color: $faint;
  font-weight: 500;
  font-size: 13px;
}

.ix-info-icon {
  color: $faint;
  cursor: help;
}
.ix-coin-info {
  color: $dim;
  line-height: 1.6;
}
.ix-coin-link {
  text-align: right;
  margin-top: 6px;
}

.ix-star {
  background: none;
  border: 0;
  padding: 0 2px;
  cursor: pointer;
  color: $faint;
  line-height: 1;
  &.is-on {
    color: $orange;
  }
  &:hover {
    color: $orange;
  }
}
.ix-star-inline {
  display: inline-flex;
  vertical-align: middle;
  margin-right: 3px;
}

.ix-head-last {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
}
.ix-last {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.ix-last-alt {
  font-size: 11px;
  color: $faint;
}

.ix-stat {
  flex: 0 0 auto;
  margin: 0;
  dt {
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: $faint;
    white-space: nowrap;
  }
  dd {
    margin: 2px 0 0;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    em {
      font-style: normal;
      font-weight: 400;
      color: $faint;
      font-size: 11px;
    }
  }
}

.ix-head-status {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: $dim;
  white-space: nowrap;
  .ix-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: $up;
    box-shadow: 0 0 8px rgba(0, 178, 117, 0.7);
  }
  &.is-down {
    color: $faint;
    .ix-dot {
      background: $faint;
      box-shadow: none;
    }
  }
}

/* ── layout ───────────────────────────────────────────────────────────── */
.ix-body {
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr) 252px 296px;
  gap: 8px;
  align-items: stretch;
}

.ix-centre {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

/* ── tabs ─────────────────────────────────────────────────────────────── */
.ix-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
  border-bottom: 1px solid $hair;
  flex: 0 0 auto;

  button {
    appearance: none;
    background: none;
    border: 0;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 600;
    color: $faint;
    cursor: pointer;
    position: relative;
    white-space: nowrap;
    transition: color 0.16s ease;

    sup {
      font-size: 9px;
      color: $orange;
      margin-left: 3px;
      top: -0.4em;
    }

    &:hover {
      color: $text;
    }
    &.is-active {
      color: $orange;
      &::after {
        content: '';
        position: absolute;
        left: 10px;
        right: 10px;
        bottom: -1px;
        height: 2px;
        border-radius: 999px;
        background: $orange;
      }
    }
  }
}

.ix-tabs-sm button {
  padding: 6px 9px;
  font-size: 11px;
}

.ix-intervals {
  margin-left: auto;
  display: flex;
  gap: 1px;
  button {
    padding: 4px 7px;
    font-size: 11px;
    font-weight: 500;
    border-radius: $radius-sm;
    &.is-active {
      color: $orange;
      background: var(--ix-orange-soft, rgba(255, 107, 0, 0.12));
      &::after {
        display: none;
      }
    }
  }
}

/* ── markets ──────────────────────────────────────────────────────────── */
.ix-markets {
  height: 726px;
}
.ix-markets-search {
  padding: 8px;
  border-bottom: 1px solid $hair;
  input {
    width: 100%;
    height: 28px;
    padding: 0 10px;
    font-size: 12px;
  }
}

.ix-market-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) 54px;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 5px 8px;
  background: none;
  border: 0;
  border-left: 2px solid transparent;
  color: $dim;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.045);
    color: $text;
  }
  &.is-current {
    border-left-color: $orange;
    background: var(--ix-orange-soft, rgba(255, 107, 0, 0.12));
    color: $text;
  }
}
.ix-market-name {
  font-weight: 600;
  color: $text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  em {
    font-style: normal;
    font-weight: 400;
    color: $faint;
  }
}

/* ── column heads and scrollers ───────────────────────────────────────── */
.ix-thead {
  display: grid;
  gap: 4px;
  padding: 6px 8px;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: $faint;
  border-bottom: 1px solid $hair;
  flex: 0 0 auto;
}
.ix-thead-markets {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) 54px;
}
.ix-thead-book {
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1fr);
}
.ix-thead-trades {
  grid-template-columns: 62px minmax(0, 1fr) minmax(0, 1fr);
}
.ix-thead-trades-full {
  grid-template-columns: 90px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
}

/* Every list lives in a fixed-height scroller. Nothing on this page is
   allowed to grow the document — that is what made the old terminal creep. */
.ix-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
}

.ix-empty {
  padding: 22px 12px;
  text-align: center;
  color: $faint;
  font-size: 11px;
}
.ix-empty-abs {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  pointer-events: none;
}

/* ── chart ────────────────────────────────────────────────────────────── */
.ix-chart-panel {
  height: 452px;
}
.ix-chart-body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

/* The widget writes an iframe in here. With `fullscreen` off and `autosize`
   on it inherits 100% of this box, which is why the box must be definite. */
.ix-kline,
.ix-depth-host {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.ix-book-full {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: $hair;
}
.ix-book-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--ix-bg, #000);
}

.ix-trades-full {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* ── order book ───────────────────────────────────────────────────────── */
.ix-rail {
  height: 726px;
}
.ix-rail-body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.ix-book-side {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.ix-book-asks {
  justify-content: flex-end;
}

.ix-book-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 4px;
  width: 100%;
  padding: 2px 8px;
  min-height: var(--row);
  align-items: center;
  background: none;
  border: 0;
  color: $dim;
  font-size: 11px;
  cursor: pointer;
  text-align: right;

  > span {
    position: relative;
    z-index: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
}

.ix-depth-bar {
  position: absolute !important;
  top: 1px;
  bottom: 1px;
  right: 0;
  z-index: 0 !important;
  border-radius: 2px 0 0 2px;
}
.is-bid .ix-depth-bar {
  background: rgba(0, 178, 117, 0.16);
}
.is-ask .ix-depth-bar {
  background: rgba(255, 74, 104, 0.14);
}

.ix-book-mid {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border-top: 1px solid $hair;
  border-bottom: 1px solid $hair;
  flex: 0 0 auto;
}
.ix-book-price {
  font-size: 15px;
  font-weight: 700;
}
.ix-book-spread {
  margin-left: auto;
  font-size: 10px;
  color: $faint;
}

.ix-book-modes {
  margin-left: auto;
  display: flex;
  gap: 3px;
}
.ix-book-mode {
  padding: 4px 3px !important;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-radius: 4px;
  i {
    display: block;
    width: 12px;
    height: 3px;
    border-radius: 1px;
    background: $faint;
  }
  &.is-all i:first-child,
  &.is-asks i {
    background: $down;
  }
  &.is-all i:last-child,
  &.is-bids i {
    background: $up;
  }
  &.is-asks i:last-child,
  &.is-bids i:first-child {
    opacity: 0.28;
  }
  &::after {
    display: none !important;
  }
  &.is-active {
    background: rgba(255, 255, 255, 0.09);
  }
}

/* ── trades ───────────────────────────────────────────────────────────── */
.ix-trade-row {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr) minmax(0, 1fr);
  gap: 4px;
  padding: 2px 8px;
  min-height: var(--row);
  align-items: center;
  font-size: 11px;
  color: $dim;
  &.is-wide {
    grid-template-columns: 90px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
  }
  &:hover {
    background: rgba(255, 255, 255, 0.04);
  }
}

/* ── account panel ────────────────────────────────────────────────────── */
.ix-account {
  height: 266px;
}
.ix-account-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.ix-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;

  th {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 7px 10px;
    text-align: left;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: $faint;
    background: var(--ix-surface-solid, #0d0d0d);
    border-bottom: 1px solid $hair;
    white-space: nowrap;
  }
  td {
    padding: 6px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.045);
    color: $dim;
    white-space: nowrap;
  }
  tbody tr:hover td {
    background: rgba(255, 255, 255, 0.035);
  }
}
.ix-strong {
  color: $text;
  font-weight: 600;
}

.ix-cancel {
  background: none;
  border: 1px solid $hair;
  border-radius: 999px;
  padding: 1px 10px;
  font-size: 10px;
  color: $dim;
  cursor: pointer;
  &:hover {
    border-color: $orange;
    color: $orange;
  }
}
.ix-link {
  color: $orange;
}

/* ── order entry ──────────────────────────────────────────────────────── */
.ix-order {
  height: 726px;
}
.ix-side-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 10px 10px 6px;
  flex: 0 0 auto;

  button {
    appearance: none;
    border: 1px solid $hair;
    background: rgba(255, 255, 255, 0.04);
    border-radius: $radius-sm;
    padding: 7px 0;
    font-size: 12px;
    font-weight: 700;
    color: $dim;
    cursor: pointer;
    transition: all 0.16s ease;

    &:first-child.is-active {
      background: rgba(0, 178, 117, 0.16);
      border-color: rgba(0, 178, 117, 0.5);
      color: $up;
    }
    &:last-child.is-active {
      background: rgba(255, 74, 104, 0.16);
      border-color: rgba(255, 74, 104, 0.5);
      color: $down;
    }
  }
}
.ix-type-tabs {
  border-bottom: 1px solid $hair;
}

.ix-order-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 10px;
}

.ix-field {
  margin-bottom: 10px;
  label {
    display: block;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: $faint;
    margin-bottom: 4px;
  }
}
.ix-input {
  position: relative;
  input {
    width: 100%;
    height: 34px;
    padding: 0 52px 0 10px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  &.is-disabled input {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
.ix-unit {
  position: absolute;
  right: 10px;
  top: 0;
  height: 34px;
  line-height: 34px;
  font-size: 11px;
  color: $faint;
  pointer-events: none;
}

.ix-slider {
  margin: 14px 0 12px;

  input[type='range'] {
    width: 100%;
    height: 4px;
    appearance: none;
    -webkit-appearance: none;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    outline: none;
    cursor: pointer;
    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 13px;
      height: 13px;
      border-radius: 999px;
      background: $orange;
      border: 2px solid #000;
      box-shadow: 0 0 0 1px var(--ix-orange-glow, rgba(255, 107, 0, 0.28));
      cursor: pointer;
    }
    &::-moz-range-thumb {
      width: 11px;
      height: 11px;
      border-radius: 999px;
      background: $orange;
      border: 2px solid #000;
      cursor: pointer;
    }
  }
}
.ix-slider-steps {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
  margin-top: 9px;

  button {
    appearance: none;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid $hair;
    border-radius: $radius-sm;
    padding: 4px 0;
    font-size: 10px;
    color: $dim;
    cursor: pointer;
    &:hover:not(:disabled) {
      border-color: $orange;
      color: $orange;
    }
    &.is-active {
      background: var(--ix-orange-soft, rgba(255, 107, 0, 0.12));
      border-color: $orange;
      color: $orange;
    }
    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }
}

.ix-meta {
  margin: 0 0 14px;
  > div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 3px 0;
  }
  dt {
    font-size: 11px;
    color: $faint;
  }
  dd {
    margin: 0;
    font-size: 11px;
    color: $text;
    em {
      font-style: normal;
      color: $faint;
    }
  }
}

.ix-submit {
  width: 100%;
  appearance: none;
  border: 0;
  border-radius: $radius-sm;
  padding: 11px 0;
  font-size: 13px;
  font-weight: 700;
  color: #04170f;
  cursor: pointer;
  transition: transform 0.16s cubic-bezier(0.2, 0.7, 0.3, 1), box-shadow 0.16s ease, filter 0.16s ease;

  &.is-buy {
    background: linear-gradient(180deg, #14c98a, var(--ix-up, #00b275));
    box-shadow: 0 6px 20px rgba(0, 178, 117, 0.26);
  }
  &.is-sell {
    background: linear-gradient(180deg, #ff6b83, var(--ix-down, #ff4a68));
    color: #1a0409;
    box-shadow: 0 6px 20px rgba(255, 74, 104, 0.26);
  }
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.06);
  }
  &:disabled {
    background: rgba(255, 255, 255, 0.07);
    color: $faint;
    box-shadow: none;
    cursor: not-allowed;
  }
}

.ix-order-note {
  margin-top: 10px;
  text-align: center;
  font-size: 11px;
  color: $faint;
}

/* ── shared atoms ─────────────────────────────────────────────────────── */
.ix-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}
.ix-up {
  color: $up;
}
.ix-down {
  color: $down;
}
.ix-dim {
  color: $faint;
}
.ix-accent {
  color: $orange;
}

/* ── responsive ───────────────────────────────────────────────────────── */
@media (max-width: 1500px) {
  .ix-body {
    grid-template-columns: minmax(0, 1fr) 236px 280px;
  }
  .ix-markets {
    display: none;
  }
}

@media (max-width: 1180px) {
  .ix-body {
    grid-template-columns: minmax(0, 1fr) 260px;
  }
  .ix-order {
    grid-column: 1 / -1;
    height: auto;
  }
  .ix-head {
    gap: 18px;
  }
}

@media (max-width: 860px) {
  .ix-body {
    grid-template-columns: minmax(0, 1fr);
  }
  .ix-rail,
  .ix-order {
    height: auto;
    max-height: 480px;
  }
  .ix-chart-panel {
    height: 360px;
  }
}
</style>

<!-- Unscoped: the TradingView widget writes the iframe into #ix_kline itself,
     so it never carries this component's scope attribute. Kept to a single id
     selector so it cannot leak into anything else. -->
<style lang="scss">
#ix_kline iframe {
  display: block;
  width: 100% !important;
  height: 100% !important;
  border: 0;
  background: var(--ix-bg, #000000);
}
</style>

