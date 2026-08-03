<template>
  <div class="ix-terminal" @keydown="onDeskKeydown">
    <!-- A-UI-1 / B7+: / markets · Esc clear · B/S buy-sell ticket · T ticket · Enter submit · X cancel last -->
    <a class="ix-skip-link" href="#ix-ticket">{{ $t("exchange.residual.skipToTicket") }}</a>
    <!-- A-UI-A11Y / B10: LiveAnnouncer-style region (assertive for ticket errors) -->
    <div class="ix-sr-only" aria-live="assertive" aria-atomic="true">{{ liveAnnounce }}</div>
    <!-- ══ pair header ══════════════════════════════════════════════════ -->
    <header class="ix-head">
      <div class="ix-head-pair">
        <button
          type="button"
          class="ix-star"
          :class="{ 'is-on': currentCoinIsFavor }"
          @click="toggleFavorite"
          :title="currentCoinIsFavor ? $t('exchange.terminal.favoriteRemove') : $t('exchange.terminal.favoriteAdd')"
          :aria-label="currentCoinIsFavor ? $t('exchange.terminal.favoriteRemove') : $t('exchange.terminal.favoriteAdd')"
          :aria-pressed="currentCoinIsFavor ? 'true' : 'false'"
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
              <a :href="coinInfo.infolink" target="_blank" rel="noopener">{{ $t("exchange.terminal.moreDetail") }}</a>
            </p>
          </div>
        </Poptip>
      </div>

      <div class="ix-head-last">
        <span class="ix-last" :class="trendClass">{{ lastPriceLabel }}</span>
        <span class="ix-last-alt" v-if="fiatValue">&asymp; {{ fiatValue }} CNY</span>
      </div>

      <dl class="ix-stat">
        <dt>{{ $t("exchange.terminal.change24h") }}</dt>
        <dd :class="trendClass">{{ marketStat(currentCoin.rose) }}</dd>
      </dl>
      <dl class="ix-stat">
        <dt>{{ $t("exchange.terminal.high24h") }}</dt>
        <dd>{{ marketNum(currentCoin.high, baseCoinScale) }}</dd>
      </dl>
      <dl class="ix-stat">
        <dt>{{ $t("exchange.terminal.low24h") }}</dt>
        <dd>{{ marketNum(currentCoin.low, baseCoinScale) }}</dd>
      </dl>
      <dl class="ix-stat ix-stat-wide">
        <dt>{{ $t("exchange.terminal.volume24h") }}</dt>
        <dd>{{ marketNum(currentCoin.volume, 2) }} <em v-if="feedLive || num(currentCoin.volume) > 0">{{ currentCoin.coin }}</em></dd>
      </dl>

      <!-- A-UI-SUB: identity catalogue switcher. No balances. No order routing. -->
      <div class="ix-head-sub">
        <SubAccountSelector @change="onSubAccountChange" />
      </div>

      <div class="ix-head-status" :class="{ 'is-down': !feedLive }" :title="feedLive ? $t('exchange.terminal.feedConnected') : $t('exchange.terminal.feedDownTitle')">
        <i class="ix-dot"></i>{{ feedLive ? $t('exchange.terminal.feedLive') : $t('exchange.terminal.feedDown') }}
      </div>
    </header>

    <!-- ══ body ═════════════════════════════════════════════════════════ -->
    <div class="ix-body" :style="deskBodyStyle">
      <!-- ── markets ──────────────────────────────────────────────────── -->
      <aside class="ix-panel ix-markets">
        <!-- B5 — column resize; widths persist in local desk prefs (not money). -->
        <div
          class="ix-resizer ix-resizer-e"
          role="separator"
          aria-orientation="vertical"
          :aria-label="$t('exchange.residual.resizeMarkets')"
          @mousedown.prevent="startPanelResize('markets', $event)"
        ></div>
        <div class="ix-markets-search">
          <input
            ref="marketSearch"
            type="text"
            v-model="searchKey"
            :placeholder="$t('exchange.residual.searchMarketSlash')"
            spellcheck="false"
            :aria-label="$t('exchange.terminal.searchMarket')"
            autocomplete="off"
          />
        </div>
        <nav class="ix-tabs ix-tabs-sm" aria-label="Market list filter">
          <button
            type="button"
            v-if="isLogin"
            :class="{ 'is-active': baseFilter === 'favor' }"
            @click="baseFilter = 'favor'"
            :title="$t('exchange.residual.watchlistTitle')"
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
          <span>{{ $t('exchange.terminal.colPair') }}</span>
          <span class="ix-num">{{ $t('exchange.terminal.colLast') }}</span>
          <span class="ix-num">{{ $t('exchange.terminal.col24h') }}</span>
        </div>
        <div class="ix-scroll">
          <p class="ix-empty ix-empty-loading" v-if="marketsLoading">{{ $t("exchange.residual.loadingMarkets") }}</p>
          <p class="ix-empty ix-empty-error" v-else-if="!marketsReachable">
            {{ $t("exchange.residual.marketsUnavailable") }}
          </p>
          <template v-else>
            <!-- B6 — watchlist rail: favourites pinned above the full list -->
            <div
              class="ix-watch-rail"
              v-if="isLogin && baseFilter !== 'favor' && watchlistMarkets.length"
            >
              <div class="ix-watch-rail-hd">
                <span>{{ $t("exchange.residual.watchlist") }}</span>
                <button type="button" class="ix-linkish" @click="baseFilter = 'favor'">
                  {{ $t("exchange.residual.allWatch") }}
                </button>
              </div>
              <button
                type="button"
                class="ix-market-row ix-market-row-watch"
                :class="{ 'is-current': row.symbol === currentCoin.symbol }"
                v-for="row in watchlistMarkets"
                :key="'w-' + row.symbol"
                @click="openPair(row)"
              >
                <span class="ix-market-name">
                  <i class="ix-star ix-star-inline is-on" @click.stop="toggleRowFavorite(row)">
                    <Icon type="ios-star" size="12" />
                  </i>
                  {{ row.coin }}<em>/{{ row.base }}</em>
                </span>
                <span class="ix-num">{{ marketNum(row.close, 6) }}</span>
                <span class="ix-num" :class="roseClass(row.rose)">{{ marketStat(row.rose) }}</span>
              </button>
            </div>
            <p class="ix-empty" v-if="visibleMarkets.length === 0">{{ $t("exchange.terminal.noMarkets") }}</p>
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
              <span class="ix-num">{{ marketNum(row.close, 6) }}</span>
              <span class="ix-num" :class="roseClass(row.rose)">{{ marketStat(row.rose) }}</span>
            </button>
          </template>
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
            <!--
              THE CHART HAS THREE STATES AND USED TO HAVE TWO.

              The overlay was gated on `!feedLive`, so with no live socket it
              covered the chart permanently — including when real candles had
              been drawn underneath it. And `chartFailed` was set from a loader
              that returned the same value for "no candles" and "request
              failed". Both are now distinct, and only 'ok' shows the canvas.
            -->
            <div
              id="ix_kline"
              class="ix-kline"
              v-show="mainTab === 'chart'"
              :class="{ 'is-empty': mainTab === 'chart' && chartStatus !== 'ok' }"
              :aria-hidden="chartStatus !== 'ok' ? 'true' : 'false'"
            ></div>
            <!-- Empty copy must sit above the chart host (z-index) — silent black fails Gate 11 at a glance. -->
            <p
              class="ix-empty ix-empty-abs ix-empty-chart ix-empty-error"
              role="status"
              v-if="mainTab === 'chart' && chartStatus === 'failed'"
            >
              {{ $t("exchange.residual.chartUnavailableHonest") }}
            </p>
            <p
              class="ix-empty ix-empty-abs ix-empty-chart"
              role="status"
              v-else-if="mainTab === 'chart' && chartStatus === 'empty'"
            >
              {{ $t('intafaced.trade.noCandles') }}
            </p>
            <p class="ix-chart-attr" v-show="mainTab === 'chart'" role="contentinfo">
              {{ $t("exchange.residual.chartingBy") }}
              <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">{{ $t("exchange.residual.tradingView") }}</a>
              {{ $t("exchange.residual.lightweightCharts") }}
            </p>

            <div class="ix-depth-host" v-show="mainTab === 'depth'">
              <DepthGraph ref="depthGraph" />
            </div>

            <div class="ix-book-full" v-show="mainTab === 'book'">
              <div class="ix-book-col">
                <div class="ix-thead ix-thead-book">
                  <span class="ix-num">{{ $t("exchange.terminal.colPriceIn", { unit: currentCoin.base }) }}</span>
                  <span class="ix-num">{{ $t("exchange.terminal.colAmountIn", { unit: currentCoin.coin }) }}</span>
                  <span class="ix-num">{{ $t("exchange.terminal.colTotal") }}</span>
                </div>
                <div class="ix-scroll">
                  <p
                    class="ix-empty"
                    :class="{ 'ix-empty-loading': bookLoading, 'ix-empty-error': !bookLoading && !bookReachable }"
                    v-if="bookLoading || !bookReachable || bids.length === 0"
                  >{{ bookSideEmpty('bids') }}</p>
                  <template v-if="bookReachable && !bookLoading">
                    <button
                      type="button"
                      class="ix-book-row is-bid"
                      v-for="(row, i) in bids"
                      :key="'fb' + i"
                      :aria-label="'Use bid price ' + fmt(row.price, baseCoinScale)"
                      @click="useBookPrice(row)"
                    >
                      <span class="ix-depth-bar" :style="{ width: barWidth(row, 'bid') }"></span>
                      <span class="ix-num ix-up">{{ fmt(row.price, baseCoinScale) }}</span>
                      <span class="ix-num">{{ fmt(row.amount, coinScale) }}</span>
                      <span class="ix-num ix-dim">{{ fmt(row.totalAmount, coinScale) }}</span>
                    </button>
                  </template>
                </div>
              </div>
              <div class="ix-book-col">
                <div class="ix-thead ix-thead-book">
                  <span class="ix-num">{{ $t("exchange.terminal.colPriceIn", { unit: currentCoin.base }) }}</span>
                  <span class="ix-num">{{ $t("exchange.terminal.colAmountIn", { unit: currentCoin.coin }) }}</span>
                  <span class="ix-num">{{ $t("exchange.terminal.colTotal") }}</span>
                </div>
                <div class="ix-scroll">
                  <p
                    class="ix-empty"
                    :class="{ 'ix-empty-loading': bookLoading, 'ix-empty-error': !bookLoading && !bookReachable }"
                    v-if="bookLoading || !bookReachable || asksAscending.length === 0"
                  >{{ bookSideEmpty('asks') }}</p>
                  <template v-if="bookReachable && !bookLoading">
                    <button
                      type="button"
                      class="ix-book-row is-ask"
                      v-for="(row, i) in asksAscending"
                      :key="'fa' + i"
                      :aria-label="'Use ask price ' + fmt(row.price, baseCoinScale)"
                      @click="useBookPrice(row)"
                    >
                      <span class="ix-depth-bar" :style="{ width: barWidth(row, 'ask') }"></span>
                      <span class="ix-num ix-down">{{ fmt(row.price, baseCoinScale) }}</span>
                      <span class="ix-num">{{ fmt(row.amount, coinScale) }}</span>
                      <span class="ix-num ix-dim">{{ fmt(row.totalAmount, coinScale) }}</span>
                    </button>
                  </template>
                </div>
              </div>
            </div>

            <div class="ix-trades-full" v-show="mainTab === 'trades'">
              <div class="ix-thead ix-thead-trades-full">
                <span>{{ $t("exchange.terminal.colTime") }}</span>
                <span class="ix-num">{{ $t("exchange.terminal.colPriceIn", { unit: currentCoin.base }) }}</span>
                <span class="ix-num">{{ $t("exchange.terminal.colAmountIn", { unit: currentCoin.coin }) }}</span>
                <span class="ix-num">{{ $t("exchange.terminal.colValue") }}</span>
              </div>
              <div class="ix-scroll">
                <p
                  class="ix-empty"
                  :class="{ 'ix-empty-loading': tradesLoading, 'ix-empty-error': !tradesLoading && !tradesReachable }"
                  v-if="tradesLoading || !tradesReachable || trades.length === 0"
                >{{ tradesEmptyLabel }}</p>
                <template v-if="tradesReachable && !tradesLoading">
                  <div class="ix-trade-row is-wide" v-for="(row, i) in trades" :key="'ft' + i">
                    <span class="ix-dim">{{ time(row.time) }}</span>
                    <span class="ix-num" :class="row.direction === 'BUY' ? 'ix-up' : 'ix-down'">
                      {{ fmt(row.price, baseCoinScale) }}
                    </span>
                    <span class="ix-num">{{ fmt(row.amount, coinScale) }}</span>
                    <span class="ix-num ix-dim">{{ fmt(turnoverOf(row), 2) }}</span>
                  </div>
                </template>
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
              {{ $t('intafaced.trade.noSession') }}
              <router-link to="/platform">{{ $t('intafaced.state.goSignIn') }}</router-link>
            </p>

            <p class="ix-empty ix-empty-loading" v-else-if="accountLoading">
              {{ $t("exchange.terminal.accountLoading") }}
            </p>

            <p class="ix-empty ix-empty-error" v-else-if="accountError">
              {{ accountError }}
            </p>

            <!-- Balances — the INTAFACED ledger, the single book -->
            <div v-else-if="accountTab === 'balances'">
              <p class="ix-empty ix-empty-note">
                {{ $t('intafaced.trade.ledgerNote') }} · <code>GET /api/v1/account/balance</code>
              </p>
              <p class="ix-empty ix-empty-error" v-if="!walletReachable">
                {{ $t("exchange.residual.ledgerUnknownBalances") }}
              </p>
              <!-- A ledger with no rows for this account is an ANSWER. It is not
                   a table of every asset at 0.00, which would claim we hold
                   assets we have never held a row for. -->
              <p class="ix-empty" v-else-if="balanceRows.length === 0">
                {{ $t('intafaced.trade.noBalances') }}
              </p>
              <table class="ix-table" v-else>
                <thead>
                  <tr>
                    <th>{{ $t('exchange.terminal.colAsset') }}</th>
                    <th class="ix-num">{{ $t('exchange.residual.free') }}</th>
                    <th class="ix-num">{{ $t('exchange.residual.held') }}</th>
                    <th class="ix-num">{{ $t('exchange.terminal.colTotal') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <!-- Decimal strings, printed as strings. -->
                  <tr v-for="row in balanceRows" :key="row.unit">
                    <td class="ix-strong">{{ row.unit }}</td>
                    <td class="ix-num">{{ row.free }}</td>
                    <td class="ix-num ix-dim">{{ row.used }}</td>
                    <td class="ix-num">{{ row.total }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Positions -->
            <div v-else-if="accountTab === 'positions'">
              <p class="ix-dualbook" role="note">
                {{ $t("exchange.residual.spotNoPerps") }}
              </p>
              <p class="ix-empty">
                {{ $t("exchange.terminal.noPositions") }}
              </p>
            </div>

            <!-- Open orders -->
            <div v-else-if="accountTab === 'open'">
              <p class="ix-empty ix-empty-error" v-if="!ordersReachable">
                {{ $t("exchange.residual.openOrdersUnknown") }}
              </p>
              <template v-else>
                <div class="ix-blotter-tools">
                  <button
                    type="button"
                    class="ix-linkish"
                    :disabled="!openOrders.length"
                    @click="exportOpenOrdersCsv"
                  >{{ $t("exchange.residual.exportCsv") }}</button>
                </div>
                <p class="ix-empty" v-if="openOrders.length === 0">{{ $t("exchange.residual.noOpenOrders") }}</p>
                <table class="ix-table" v-else>
                  <thead>
                    <tr>
                      <th>{{ $t('exchange.terminal.colTime') }}</th>
                      <th>{{ $t('exchange.terminal.colMarket') }}</th>
                      <th>{{ $t('exchange.terminal.colType') }}</th>
                      <th>{{ $t('exchange.terminal.colSide') }}</th>
                      <th class="ix-num">{{ $t('exchange.terminal.colPrice') }}</th>
                      <th class="ix-num">{{ $t('exchange.terminal.colAmount') }}</th>
                      <th class="ix-num">{{ $t('exchange.terminal.colFilled') }}</th>
                      <th class="ix-num">{{ $t('exchange.terminal.colValue') }}</th>
                      <th class="ix-num"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, i) in openOrders" :key="row.orderId || i">
                      <td class="ix-dim">{{ date(row.time) }}</td>
                      <td>{{ row.symbol }}</td>
                      <td class="ix-dim">{{ row.type === 'MARKET_PRICE' ? $t('exchange.terminal.typeMarket') : $t('exchange.terminal.typeLimit') }}</td>
                      <td :class="row.direction === 'BUY' ? 'ix-up' : 'ix-down'">
                        {{ row.direction === 'BUY' ? $t('exchange.terminal.buy') : $t('exchange.terminal.sell') }}
                      </td>
                      <td class="ix-num">{{ priceLabel(row) }}</td>
                      <td class="ix-num">{{ dec(row.amount) }}</td>
                      <td class="ix-num" :title="fillTitle(row)">{{ fillLabel(row) }}</td>
                      <td class="ix-num">{{ dec(row.turnover) }}</td>
                      <td class="ix-num ix-actions">
                        <button
                          type="button"
                          class="ix-linkish"
                          :title="$t('exchange.residual.copyOrderId') + ' ' + (row.orderId || '')"
                          @click="copyOrderId(row)"
                        >ID</button>
                        <button
                          type="button"
                          class="ix-cancel"
                          :disabled="!!cancellingId"
                          :aria-label="'Cancel order ' + (row.orderId || '')"
                          @click="cancelOrder(row)"
                        >{{ cancellingId === row.orderId ? $t('exchange.residual.cancelling') : $t('exchange.terminal.cancel') }}</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </template>
            </div>

            <!-- Trade history (fills) -->
            <p class="ix-empty ix-empty-error" v-else-if="accountTab === 'fills' && !fillsReachable">
              {{ $t("exchange.residual.fillsUnknown") }}
            </p>
            <table class="ix-table" v-else-if="accountTab === 'fills'">
              <thead>
                <tr>
                  <th>{{ $t('exchange.terminal.colTime') }}</th>
                  <th>{{ $t('exchange.terminal.colMarket') }}</th>
                  <th>{{ $t('exchange.terminal.colSide') }}</th>
                  <th>{{ $t('exchange.residual.role') }}</th>
                  <th class="ix-num">{{ $t('exchange.terminal.colPrice') }}</th>
                  <th class="ix-num">{{ $t('exchange.terminal.colAmount') }}</th>
                  <th class="ix-num">{{ $t('exchange.terminal.colValue') }}</th>
                  <th class="ix-num">{{ $t('exchange.terminal.colFee') }}</th>
                </tr>
              </thead>
              <tbody>
                <!-- Decimal strings, printed as strings. -->
                <tr v-for="(row, i) in fills" :key="'fill' + i">
                  <td class="ix-dim">{{ date(row.time) }}</td>
                  <td>{{ row.symbol }}</td>
                  <td :class="row.direction === 'BUY' ? 'ix-up' : 'ix-down'">
                    {{ row.direction === 'BUY' ? $t('exchange.terminal.buy') : $t('exchange.terminal.sell') }}
                  </td>
                  <td class="ix-dim">{{ row.liquidity || '—' }}</td>
                  <td class="ix-num">{{ dec(row.price) }}</td>
                  <td class="ix-num">{{ dec(row.amount) }}</td>
                  <td class="ix-num">{{ dec(row.turnover) }}</td>
                  <td class="ix-num ix-dim">{{ dec(row.fee) }} {{ row.feeAsset || '' }}</td>
                </tr>
              </tbody>
            </table>

            <!-- Order history -->
            <p class="ix-empty ix-empty-error" v-else-if="accountTab === 'history' && !ordersReachable">
              {{ $t("exchange.residual.orderHistoryUnknown") }}
            </p>
            <div v-else-if="accountTab === 'history'">
              <div class="ix-blotter-tools" v-if="ordersReachable && historyOrders.length">
                <button
                  type="button"
                  class="ix-linkish"
                  @click="exportHistoryOrdersCsv"
                >{{ $t("exchange.residual.exportCsv") }}</button>
              </div>
              <p class="ix-empty" v-if="!historyOrders.length">{{ $t("exchange.residual.noOrderHistory") }}</p>
              <table class="ix-table" v-else>
                <thead>
                  <tr>
                    <th>{{ $t('exchange.terminal.colTime') }}</th>
                    <th>{{ $t('exchange.terminal.colMarket') }}</th>
                    <th>{{ $t('exchange.terminal.colType') }}</th>
                    <th>{{ $t('exchange.terminal.colSide') }}</th>
                    <th class="ix-num">{{ $t('exchange.terminal.colPrice') }}</th>
                    <th class="ix-num">{{ $t('exchange.terminal.colAmount') }}</th>
                    <th class="ix-num">{{ $t('exchange.terminal.colFilled') }}</th>
                    <th class="ix-num">{{ $t('exchange.terminal.colValue') }}</th>
                    <th>{{ $t('exchange.terminal.colStatus') }}</th>
                    <th class="ix-num"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, i) in historyOrders" :key="row.orderId || 'h' + i">
                    <td class="ix-dim">{{ date(row.time) }}</td>
                    <td>{{ row.symbol }}</td>
                    <td class="ix-dim">{{ row.type === 'MARKET_PRICE' ? $t('exchange.terminal.typeMarket') : $t('exchange.terminal.typeLimit') }}</td>
                    <td :class="row.direction === 'BUY' ? 'ix-up' : 'ix-down'">
                      {{ row.direction === 'BUY' ? $t('exchange.terminal.buy') : $t('exchange.terminal.sell') }}
                    </td>
                    <td class="ix-num">{{ priceLabel(row) }}</td>
                    <td class="ix-num">{{ dec(row.amount) }}</td>
                    <td class="ix-num" :title="fillTitle(row)">{{ fillLabel(row) }}</td>
                    <td class="ix-num">{{ dec(row.turnover) }}</td>
                    <td :class="statusClass(row)">{{ statusLabel(row) }}</td>
                    <td class="ix-num ix-actions">
                      <button
                        type="button"
                        class="ix-linkish"
                        :title="$t('exchange.residual.copyOrderId') + ' ' + (row.orderId || '')"
                        @click="copyOrderId(row)"
                      >ID</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p class="ix-empty" v-if="isLogin && !accountLoading && !accountError && accountTabEmpty">{{ $t("exchange.terminal.nothingYet") }}</p>
          </div>
        </section>
      </main>

      <!-- ── order book / trades rail ─────────────────────────────────── -->
      <aside class="ix-panel ix-rail">
        <div
          class="ix-resizer ix-resizer-w"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize book column"
          @mousedown.prevent="startPanelResize('rail', $event)"
        ></div>
        <nav class="ix-tabs ix-tabs-head">
          <button
            type="button"
            :class="{ 'is-active': railTab === 'book' }"
            @click="railTab = 'book'"
          >{{ $t("exchange.terminal.tabBook") }}</button>
          <button
            type="button"
            :class="{ 'is-active': railTab === 'trades' }"
            @click="railTab = 'trades'"
          >{{ $t("exchange.terminal.tabTrades") }}</button>
          <div class="ix-book-modes" v-show="railTab === 'book'">
            <button
              type="button"
              v-for="m in bookModes"
              :key="m.id"
              :class="['ix-book-mode', 'is-' + m.id, { 'is-active': bookMode === m.id }]"
              :title="m.label"
              @click="bookMode = m.id"
            ><i></i><i></i></button>
            <select
              class="ix-book-group"
              v-model.number="bookGroup"
              :title="$t('exchange.residual.priceGrouping')"
              aria-label="Order book price grouping"
            >
              <option v-for="g in bookGroups" :key="g" :value="g">{{ g === 1 ? $t('exchange.residual.oneTick') : '×' + g }}</option>
            </select>
          </div>
        </nav>

        <div class="ix-rail-body" v-show="railTab === 'book'">
          <div class="ix-thead ix-thead-book">
            <span class="ix-num">{{ $t("exchange.terminal.colPrice") }}</span>
            <span class="ix-num">{{ $t("exchange.terminal.colAmount") }}</span>
            <span class="ix-num">{{ $t("exchange.terminal.colTotal") }}</span>
          </div>

          <div class="ix-book-side ix-book-asks" v-show="bookMode !== 'bids'">
            <p
              class="ix-empty"
              :class="{ 'ix-empty-loading': bookLoading, 'ix-empty-error': !bookLoading && !bookReachable }"
              v-if="bookLoading || !bookReachable || asks.length === 0"
            >{{ bookSideEmpty('asks') }}</p>
            <template v-if="bookReachable && !bookLoading">
              <button
                type="button"
                class="ix-book-row is-ask"
                v-for="(row, i) in asks"
                :key="'a' + i"
                :aria-label="'Use ask price ' + zero(row.price, baseCoinScale)"
                @click="useBookPrice(row)"
              >
                <span class="ix-depth-bar" :style="{ width: barWidth(row, 'ask') }"></span>
                <span class="ix-num ix-down">{{ zero(row.price, baseCoinScale) }}</span>
                <span class="ix-num">{{ zero(row.amount, coinScale) }}</span>
                <span class="ix-num ix-dim">{{ zero(row.totalAmount, coinScale) }}</span>
              </button>
            </template>
          </div>

          <div class="ix-book-mid">
            <span class="ix-book-price" :class="trendClass">{{ lastPriceLabel }}</span>
            <Icon v-if="trend > 0" type="md-arrow-up" class="ix-up" size="14" />
            <Icon v-else-if="trend < 0" type="md-arrow-down" class="ix-down" size="14" />
            <span class="ix-book-spread" v-if="spread !== null && bookReachable">{{ $t("exchange.terminal.spread") }} {{ spread }}</span>
          </div>

          <div class="ix-book-side ix-book-bids" v-show="bookMode !== 'asks'">
            <p
              class="ix-empty"
              :class="{ 'ix-empty-loading': bookLoading, 'ix-empty-error': !bookLoading && !bookReachable }"
              v-if="bookLoading || !bookReachable || bids.length === 0"
            >{{ bookSideEmpty('bids') }}</p>
            <template v-if="bookReachable && !bookLoading">
              <button
                type="button"
                class="ix-book-row is-bid"
                v-for="(row, i) in bids"
                :key="'b' + i"
                :aria-label="'Use bid price ' + zero(row.price, baseCoinScale)"
                @click="useBookPrice(row)"
              >
                <span class="ix-depth-bar" :style="{ width: barWidth(row, 'bid') }"></span>
                <span class="ix-num ix-up">{{ zero(row.price, baseCoinScale) }}</span>
                <span class="ix-num">{{ zero(row.amount, coinScale) }}</span>
                <span class="ix-num ix-dim">{{ zero(row.totalAmount, coinScale) }}</span>
              </button>
            </template>
          </div>
        </div>

        <div class="ix-rail-body" v-show="railTab === 'trades'">
          <div class="ix-thead ix-thead-trades">
            <span>{{ $t("exchange.terminal.colTime") }}</span>
            <span class="ix-num">{{ $t("exchange.terminal.colPrice") }}</span>
            <span class="ix-num">{{ $t("exchange.terminal.colAmount") }}</span>
          </div>
          <div class="ix-scroll">
            <p
              class="ix-empty"
              :class="{ 'ix-empty-loading': tradesLoading, 'ix-empty-error': !tradesLoading && !tradesReachable }"
              v-if="tradesLoading || !tradesReachable || trades.length === 0"
            >{{ tradesEmptyLabel }}</p>
            <template v-if="tradesReachable && !tradesLoading">
              <div class="ix-trade-row" v-for="(row, i) in trades" :key="'t' + i">
                <span class="ix-dim">{{ time(row.time) }}</span>
                <span class="ix-num" :class="row.direction === 'BUY' ? 'ix-up' : 'ix-down'">
                  {{ fmt(row.price, baseCoinScale) }}
                </span>
                <span class="ix-num">{{ fmt(row.amount, coinScale) }}</span>
              </div>
            </template>
          </div>
        </div>
      </aside>

      <!-- ── order entry ──────────────────────────────────────────────── -->
      <aside id="ix-ticket" class="ix-panel ix-order" tabindex="-1" aria-label="Order ticket">
        <div
          class="ix-resizer ix-resizer-w"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize order ticket column"
          @mousedown.prevent="startPanelResize('order', $event)"
        ></div>
        <div class="ix-side-toggle" role="group" aria-label="Order side">
          <button
            type="button"
            :class="{ 'is-active': side === 'BUY' }"
            :aria-pressed="side === 'BUY' ? 'true' : 'false'"
            @click="setSide('BUY')"
          >{{ $t("exchange.terminal.buy") }}</button>
          <button
            type="button"
            :class="{ 'is-active': side === 'SELL' }"
            :aria-pressed="side === 'SELL' ? 'true' : 'false'"
            @click="setSide('SELL')"
          >{{ $t("exchange.terminal.sell") }}</button>
        </div>

        <nav class="ix-tabs ix-tabs-sm ix-type-tabs" aria-label="Order type">
          <button
            type="button"
            :class="{ 'is-active': orderType === 'LIMIT_PRICE' }"
            :aria-pressed="orderType === 'LIMIT_PRICE' ? 'true' : 'false'"
            @click="setOrderType('LIMIT_PRICE')"
          >{{ $t("exchange.terminal.typeLimit") }}</button>
          <button
            type="button"
            :class="{ 'is-active': orderType === 'MARKET_PRICE' }"
            :aria-pressed="orderType === 'MARKET_PRICE' ? 'true' : 'false'"
            @click="setOrderType('MARKET_PRICE')"
          >{{ $t("exchange.terminal.typeMarket") }}</button>
        </nav>

        <div class="ix-order-body">
          <!-- A-UI-A11Y / B10 GOV.UK error-summary: focus lands here; text matches field error -->
          <div
            v-if="orderErrorSummary"
            :id="orderErrorSummary.id"
            ref="orderErrorSummary"
            class="ix-error-summary"
            role="alert"
            tabindex="-1"
          >
            <p class="ix-error-summary-title">{{ orderErrorSummary.title }}</p>
            <ul class="ix-error-summary-list">
              <li>
                <a
                  v-if="orderErrorSummary.href"
                  class="ix-error-summary-link"
                  :href="orderErrorSummary.href"
                  @click.prevent="focusTicketErrorField"
                >{{ orderErrorSummary.message }}</a>
                <span v-else>{{ orderErrorSummary.message }}</span>
              </li>
            </ul>
          </div>

          <div class="ix-field">
            <label for="ix-ticket-price">{{ $t("exchange.terminal.fieldPrice") }}</label>
            <div class="ix-input" :class="{ 'is-disabled': orderType === 'MARKET_PRICE' }">
              <input
                id="ix-ticket-price"
                ref="ticketPrice"
                type="text"
                inputmode="decimal"
                spellcheck="false"
                :disabled="orderType === 'MARKET_PRICE'"
                :placeholder="orderType === 'MARKET_PRICE' ? $t('exchange.terminal.bestAvailable') : ''"
                :aria-invalid="ticketPriceAria['aria-invalid']"
                :aria-describedby="ticketPriceAria['aria-describedby']"
                v-model="form.price"
                @input="onPriceInput"
                @keydown.enter.prevent="submitOrder"
              />
              <span class="ix-unit">{{ currentCoin.base }}</span>
            </div>
          </div>

          <div class="ix-field">
            <label for="ix-ticket-amount">{{ amountLabel }}</label>
            <div class="ix-input">
              <input
                id="ix-ticket-amount"
                ref="ticketAmount"
                type="text"
                inputmode="decimal"
                spellcheck="false"
                placeholder=""
                :aria-invalid="ticketAmountAria['aria-invalid']"
                :aria-describedby="ticketAmountAria['aria-describedby']"
                v-model="form.amount"
                @input="onAmountInput"
                @keydown.enter.prevent="submitOrder"
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
              <dt>{{ $t("exchange.terminal.available") }} <em class="ix-dim">(ledger)</em></dt>
              <!-- Three distinct states. `availableBalance` is null when the
                   ledger holds no row for this asset, which is neither "unknown"
                   nor "zero" — it is "you do not hold this". -->
              <dd v-if="!isLogin" class="ix-dim">— <em>{{ $t("exchange.residual.noPlatformSession") }}</em></dd>
              <dd v-else-if="!walletReachable" class="ix-dim">— <em>{{ $t("exchange.residual.unknownLedger") }}</em></dd>
              <dd v-else-if="availableBalance === null" class="ix-dim">
                0 <em>{{ side === 'BUY' ? currentCoin.base : currentCoin.coin }} {{ $t("exchange.residual.noLedgerRow") }}</em>
              </dd>
              <dd v-else>
                {{ availableBalance }}
                <em>{{ side === 'BUY' ? currentCoin.base : currentCoin.coin }}</em>
              </dd>
            </div>
            <div v-if="orderType === 'LIMIT_PRICE'">
              <dt>{{ $t("exchange.terminal.orderValue") }}</dt>
              <dd>{{ fmt(orderValue, baseCoinScale) }} <em>{{ currentCoin.base }}</em></dd>
            </div>
            <div class="ix-fee-row">
              <dt>
                {{ $t("exchange.terminal.feeEst") }}
                <button
                  type="button"
                  class="ix-fee-help"
                  :aria-expanded="feeHelpOpen ? 'true' : 'false'"
                  aria-controls="ix-fee-help"
                  @click="feeHelpOpen = !feeHelpOpen"
                >?</button>
              </dt>
              <dd>{{ feeLabel }}</dd>
              <p
                v-if="feeHelpOpen"
                id="ix-fee-help"
                class="ix-fee-disclosure"
                role="note"
              >
                <template v-if="feeKnown">
                  {{ $t("exchange.residual.pairFeeFrom") }}
                  <strong>{{ currentCoin.coin }}/{{ currentCoin.base }}</strong>
                  — {{ pctOf(symbolFee, 4) }}% {{ $t("exchange.residual.scheduleRateNotFree") }}
                </template>
                <template v-else>
                  {{ $t("exchange.residual.feeFieldMissing") }}
                  <strong>unknown</strong>{{ $t("exchange.residual.feeFieldMissingTail") }}
                </template>
              </p>
            </div>
            <div v-if="orderType === 'MARKET_PRICE' && marketImpactLabel">
              <dt>{{ $t("exchange.residual.bookImpact") }} <em class="ix-dim">(est.)</em></dt>
              <dd>{{ marketImpactLabel }}</dd>
            </div>
          </dl>

          <button
            type="button"
            class="ix-submit"
            :class="side === 'BUY' ? 'is-buy' : 'is-sell'"
            :disabled="!tradable || submitting || !!orderBlockReason"
            :aria-busy="submitting ? 'true' : 'false'"
            @click="submitOrder"
          >
            {{ submitting ? $t('exchange.terminal.placing') : submitLabel }}
          </button>
          <p class="ix-order-note ix-dim ix-kbd-hint" :title="$t('exchange.residual.keyboardShortcuts')">
            <kbd>/</kbd> markets · <kbd>{{ $t("shellResidual.esc") }}</kbd> clear · <kbd>B</kbd>/<kbd>S</kbd> buy/sell · <kbd>T</kbd> ticket · <kbd>{{ $t("shellResidual.enter") }}</kbd> submit · <kbd>X</kbd> {{ $t("exchange.residual.cancelLast") }} <kbd>⌘</kbd>/<kbd>{{ $t("exchange.residual.ctrl") }}</kbd>+<kbd>K</kbd> go
          </p>
          <!-- Inline echo kept in sync with summary (GOV.UK: same wording); focus is on summary -->
          <p
            class="ix-order-note ix-order-error"
            aria-hidden="true"
            v-if="orderValidationError"
          >{{ orderValidationError }}</p>
          <p class="ix-order-note" v-if="!isLogin">
            <router-link to="/login">{{ $t("exchange.terminal.signIn") }}</router-link> or
            <router-link to="/register">{{ $t("exchange.terminal.register") }}</router-link> {{ $t("exchange.terminal.toTrade") }}
          </p>
          <p class="ix-order-note" v-else-if="exchangeable != 1">{{ $t("exchange.terminal.halted") }}</p>
          <p class="ix-order-note" v-else-if="orderType === 'MARKET_PRICE' && !marketAllowed">
            {{ $t('exchange.terminal.marketDisabled', { side: side === 'BUY' ? $t('exchange.terminal.buyLower') : $t('exchange.terminal.sellLower') }) }}
          </p>
          <p class="ix-order-note" v-else-if="!feedLive">
            {{ $t("exchange.terminal.feedDownWarning") }}
          </p>
          <p class="ix-order-note" v-else-if="orderBlockReason">{{ orderBlockReason }}</p>
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

   The vendor built the chart library widget with `fullscreen: true`. In
   the chart engine that flag drives:

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
   unhandled rejections. The chart uses lightweight-charts (Apache-2.0) and
   loads history from /market/history; empty history draws an empty frame.
   ========================================================================== */
import { KlineChart } from '@js/market-chart/kline.js';
import DepthGraph from '@components/exchange/DepthGraph.vue';
import SubAccountSelector from '@components/intafaced/SubAccountSelector.vue';

import { rest, symbolPath, REST_BASE } from '@/config/intafaced.js';

var moment = require('moment');
var deskHotkeys = require('../../assets/js/desk-hotkeys.js');
var deskA11y = require('../../assets/js/desk-a11y.js');
var deskPrefs = require('../../assets/js/desk-prefs.js');
var bookHonesty = require('../../assets/js/book-honesty.js');
var ixMoney = require('../../assets/js/ix-money.js');
var subAccounts = require('../../assets/js/sub-accounts.js');
var ixTrade = require('../../assets/js/ix-trade.js');

const BOOK_DEPTH = 14;
const TRADE_LIMIT = 40;
const DEPTH_REDRAW_MS = 1000;
/** Levels pulled for the depth chart — deeper than the ladder; API caps at 500. */
const DEPTH_LEVELS = 200;

export default {
  components: { DepthGraph, SubAccountSelector },
  data() {
    return {
      defaultPair: 'btc_usdt',

      currentCoin: { base: '', coin: '', symbol: '', close: 0, rose: '', high: 0, low: 0, volume: 0 },
      currentCoinIsFavor: false,
      coinInfo: {},
      /* Decimal-place counts come from market.precision only (getSymbolScale).
         null = instrument has not published yet — fmt/group/clamp refuse invent. */
      coinScale: null,
      baseCoinScale: null,
      /* A fee RATE is money-shaped: a decimal string, never a float literal.
         Shown only when feeKnown — the ticket says "unknown", not "free". */
      symbolFee: '0.001',
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
      bookGroup: 1,
      bookGroups: [1, 10, 50, 100],
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
      /* True only after market symbol-info returns a fee field. Default is not free. */
      feeKnown: false,
      /** B9 fee schedule disclosure open (ticket). */
      feeHelpOpen: false,

      marketsLoading: false,
      marketsReachable: false,
      /** True until first plate REST settles — loading ≠ unavailable. */
      bookLoading: true,
      bookReachable: false,
      /** True until first trades REST settles. */
      tradesLoading: true,
      tradesReachable: false,

      plate: { asks: [], bids: [], askTotal: '0', bidTotal: '0' },
      trades: [],
      openOrders: [],
      historyOrders: [],
      /** Fills from /account/trades. A separate call — orders carry no nested fills. */
      myFills: [],
      fillsReachable: false,
      /** Every ledger row for this user, from /account/balance. */
      balances: [],
      /**
       * Free balance for the two assets of THIS pair, or null.
       *
       * NULL, NOT 0. No ledger row means the ledger has never held that asset
       * for this user; a zero here would size an order against a balance we
       * invented. Every reader of this guards on null.
       */
      wallet: { base: null, coin: null },
      /** The venue's listing row for this pair (tick, lot, min notional, fees). */
      market: null,
      /** Watchlist symbols, local to this browser. Not account state. */
      localFavorites: [],
      /** Verbatim refusal text, kept so a panel can quote the venue. */
      bookMessage: '',
      tradesMessage: '',
      accountRefusal: '',
      /** 'ok' | 'empty' | 'failed' — see kline.js. */
      chartStatus: 'ok',
      accountLoading: false,
      accountError: '',
      walletReachable: false,
      ordersReachable: false,

      side: 'BUY',
      orderType: 'LIMIT_PRICE',
      percent: 0,
      form: { price: '', amount: '' },

      trend: 0,
      submitting: false,
      cancellingId: null,
      /** Inline field validation message; empty when fields look usable. */
      orderValidationError: '',
      /** B10 — screen-reader announcements (order rejects, validation). */
      liveAnnounce: '',
      /** B5 — fixed column widths (px); centre flexes. Not money. */
      panelW: Object.assign({}, deskPrefs.PANEL_DEFAULTS),
      /** Viewport wide enough for four-column desk + resize handles. */
      panelResizeActive: true
    };
  },

  computed: {
    /* A-UI-A11Y / B10 — GOV.UK error-summary model (verbatim ticket error). */
    orderErrorSummary() {
      return deskA11y.buildTicketErrorSummary(this.orderValidationError);
    },
    ticketPriceAria() {
      return deskA11y.ticketFieldAria('price', this.orderValidationError);
    },
    ticketAmountAria() {
      return deskA11y.ticketFieldAria('amount', this.orderValidationError);
    },
    /** B5 — desktop grid only; narrow layouts keep CSS media queries. */
    deskBodyStyle() {
      if (!this.panelResizeActive) return {};
      var w = deskPrefs.normalizePanelWidths(this.panelW);
      return {
        gridTemplateColumns:
          w.markets + 'px minmax(0, 1fr) ' + w.rail + 'px ' + w.order + 'px'
      };
    },
    /** The platform session's access token, or null. In memory only. */
    ixToken() {
      return this.$store.getters.ixToken;
    },
    /**
     * "SIGNED IN" ON THIS SCREEN MEANS THE PLATFORM SESSION, NOT THE SHELL ONE.
     *
     * This desk now talks only to svc-edge, and svc-edge only believes
     * `ixToken`. It used to read `$store.getters.isLogin`, which is the
     * vendored ucenter session — a completely separate login. Leaving it that
     * way would have been the worst combination available: a reader signed in
     * to the shell would get an enabled order ticket, a blotter that reads
     * "no open orders", and a 401 the moment they pressed Buy.
     *
     * The shell session still exists and still governs the shell's own screens.
     * It just cannot answer for anything on this page.
     */
    isLogin() {
      return !!this.ixToken;
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
      return this.groupPlate(this.plate.asks, 'ask').slice(-BOOK_DEPTH);
    },
    asksAscending() {
      return this.groupPlate(this.plate.asks, 'ask').slice().reverse();
    },
    bids() {
      return this.groupPlate(this.plate.bids, 'bid').slice(0, BOOK_DEPTH);
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
    /* B6 — favourites for the pinned watchlist rail (density-capped). */
    watchlistMarkets() {
      const key = this.searchKey.trim().toUpperCase();
      let rows = this.markets.filter(r => r.isFavor);
      if (key) {
        rows = rows.filter(r => (r.coin || '').indexOf(key) === 0);
      }
      return rows.slice(0, 8);
    },
    /**
     * The Balances tab — every asset the ledger holds for this user.
     *
     * NOT just the two assets of this pair. The vendor showed exactly two rows
     * because it read a per-asset wallet endpoint twice; ours returns the whole
     * book in one answer, and hiding the rest would misrepresent the account.
     * `used` is shown beside `free` because a held balance is not spendable and
     * a trader who cannot see the difference will size an order they cannot
     * fill.
     *
     * No value column: converting a balance to fiat needs a price per asset and
     * this platform publishes no rate source.
     */
    balanceRows() {
      return this.balances;
    },
    fills() {
      return this.myFills;
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
      /* Only claim empty when the service answered — unknown ≠ empty. */
      if (this.accountTab === 'balances') return this.walletReachable && this.balances.length === 0;
      if (this.accountTab === 'fills') return this.fillsReachable && this.fills.length === 0;
      if (!this.ordersReachable) return false;
      if (this.accountTab === 'open') return this.openOrders.length === 0;
      if (this.accountTab === 'history') return this.historyOrders.length === 0;
      return false;
    },
    /**
     * The free balance of the asset this side spends, as a decimal STRING, or
     * null when the ledger has no row for it.
     *
     * Null propagates deliberately: `canSize` refuses to compute a percentage
     * of an unknown balance, and `validateOrderFields` will not claim
     * "insufficient balance" against a number it does not have.
     */
    availableBalance() {
      return this.side === 'BUY' ? this.wallet.base : this.wallet.coin;
    },
    /**
     * Balance as a float ONLY for inequality checks in validateOrderFields /
     * canSize. Percent sizing uses the string balance through ix-money — never
     * this number — so the value that reaches POST /orders is not a float.
     * Null (no ledger row) yields NaN rather than 0 so nothing sizes against a
     * balance that does not exist.
     */
    availableBalanceNum() {
      const n = ixMoney.toFloat(this.availableBalance);
      return n === null ? NaN : n;
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
        return this.form.amount;
      }
      /* Decimal product for the ticket summary — not a wire amount. */
      return ixMoney.multiply(this.form.price, this.form.amount, this.baseCoinScale);
    },
    /**
     * Wave B8 — rough walk of top-of-book for market size already on the page.
     * Estimate only; never invents fill when book is empty / unreachable.
     */
    marketImpactLabel() {
      if (this.orderType !== 'MARKET_PRICE') return '';
      if (!this.bookReachable) return 'book unknown';
      const size = this.num(this.form.amount);
      if (size <= 0) return '';
      const levels =
        this.side === 'BUY'
          ? this.groupPlate(this.plate.asks, 'ask').slice().reverse()
          : this.groupPlate(this.plate.bids, 'bid').slice();
      if (!levels.length) return 'no depth';
      let remain = size;
      let cost = 0;
      let filled = 0;
      const mid = this.lastPrice;
      for (let i = 0; i < levels.length && remain > 0; i++) {
        const px = this.num(levels[i].price);
        const qty = this.num(levels[i].amount);
        if (px <= 0 || qty <= 0) continue;
        if (this.quoteSized) {
          /* Market buy amount is quote currency — spend remain quote. */
          const takeQuote = Math.min(remain, px * qty);
          const takeBase = takeQuote / px;
          cost += takeQuote;
          filled += takeBase;
          remain -= takeQuote;
        } else {
          const take = Math.min(remain, qty);
          cost += take * px;
          filled += take;
          remain -= take;
        }
      }
      if (filled <= 0) return 'no depth';
      const avg = cost / filled;
      const slip =
        mid > 0 ? ((this.side === 'BUY' ? avg - mid : mid - avg) / mid) * 100 : null;
      const avgTxt = this.fmt(avg, this.baseCoinScale);
      if (remain > 1e-12) {
        return slip == null
          ? `avg ${avgTxt} · partial book`
          : `avg ${avgTxt} · ~${slip.toFixed(2)}% · partial`;
      }
      return slip == null ? `avg ${avgTxt}` : `avg ${avgTxt} · ~${slip.toFixed(2)}%`;
    },
    /* A percent of an unknown balance is not a number. isPositive is false for
       null/empty, so the percent buttons stay off rather than sizing fiction. */
    canSize() {
      return this.isLogin && ixMoney.isPositive(this.availableBalance) &&
        (this.orderType === 'MARKET_PRICE' || ixMoney.isPositive(this.form.price));
    },
    marketAllowed() {
      return this.side === 'BUY' ? this.enableMarketBuy == 1 : this.enableMarketSell == 1;
    },
    tradable() {
      if (!this.isLogin || this.submitting) return false;
      if (this.exchangeable != 1) return false;
      if (this.orderType === 'MARKET_PRICE' && !this.marketAllowed) return false;
      /* A-UI-SUB: sub selection blocks place until money routing is wired. */
      if (!subAccounts.canPlaceOrder(this.$store.state.ixSubAccountId)) return false;
      return true;
    },
    /** Structural block (halt/market type / sub routing) — separate from field validation. */
    orderBlockReason() {
      if (!this.isLogin) return '';
      if (this.exchangeable != 1) return '{{ $t("exchange.terminal.halted") }}';
      if (this.orderType === 'MARKET_PRICE' && !this.marketAllowed) {
        return 'Market ' + (this.side === 'BUY' ? 'buy' : 'sell') + ' is disabled for this pair.';
      }
      var subBlock = subAccounts.tradeBlockReason(this.$store.state.ixSubAccountId);
      if (subBlock) return subBlock;
      return '';
    },
    submitLabel() {
      const verb = this.side === 'BUY' ? 'Buy' : 'Sell';
      return this.currentCoin.coin ? verb + ' ' + this.currentCoin.coin : verb;
    },
    /* Last / 24h stats: never present a cold zero as a live market print. */
    lastPriceLabel() {
      return this.marketNum(this.lastPrice, this.baseCoinScale);
    },
    feeLabel() {
      if (!this.feeKnown) {
        return 'unknown · the venue published no fee for this pair (not free)';
      }
      /* symbolFee is the published TAKER rate as a decimal string ("0.001").
         pctOf multiplies in decimal — a label, not a charge. */
      return this.pctOf(this.symbolFee, 2) + '% taker · venue schedule for this pair';
    },
    tradesEmptyLabel() {
      return bookHonesty.tradesEmptyLabel({
        loading: this.tradesLoading,
        reachable: this.tradesReachable
      });
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
        this.accountError = '';
        this.accountLoading = false;
        this.walletReachable = false;
        this.ordersReachable = false;
      }
    },
    'currentCoin.close': function (value) {
      const next = this.num(value);
      if (this.lastTick && next !== this.lastTick) {
        this.trend = next > this.lastTick ? 1 : -1;
      }
      this.lastTick = next;
    },
    /* Wave B5 — cheap desk memory (local only; never money). */
    bookMode() {
      this.saveDeskPrefs();
    },
    bookGroup() {
      this.saveDeskPrefs();
    },
    interval() {
      this.saveDeskPrefs();
    },
    mainTab() {
      this.saveDeskPrefs();
    },
    railTab() {
      this.saveDeskPrefs();
    },
    baseFilter() {
      this.saveDeskPrefs();
    },
    accountTab() {
      this.saveDeskPrefs();
    },
    side() {
      this.saveDeskPrefs();
    }
  },

  created() {
    /* Deliberately NOT in data(). Vue would deep-observe these, and
       isPlainObject() is true for class instances — it would walk the chart
       library widget into its internal handles, defining accessors all the way
       down. None of them are rendered, so none of them need to be reactive. */
    this.klineChart = null;
    this.depthTimer = 0;
    this.depthPending = false;
    this.lastTick = 0;

    this.loadDeskPrefs();
    this.syncPanelResizeActive();
    this.init();
    /* B7 — capture when focus is not in a field (document-level). */
    this._onDeskKeyWindow = e => this.onDeskKeydown(e, true);
    this._onWinResize = () => this.syncPanelResizeActive();
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onDeskKeyWindow, true);
      window.addEventListener('resize', this._onWinResize);
    }
  },

  beforeDestroy() {
    if (typeof window !== 'undefined') {
      if (this._onDeskKeyWindow) {
        window.removeEventListener('keydown', this._onDeskKeyWindow, true);
      }
      if (this._onWinResize) {
        window.removeEventListener('resize', this._onWinResize);
      }
    }
    this.teardown();
  },

  methods: {
    /* ── plumbing ──────────────────────────────────────────────────────── */

    /**
     * A-UI-1 / Wave B7+ keyboard floor (desk only — no new backend).
     * Map lives in assets/js/desk-hotkeys.js; handlers call existing methods only.
     * @param {KeyboardEvent} e
     * @param {boolean} fromWindow capture-phase for global shortcuts when focus is outside the desk tree
     */
    onDeskKeydown(e, fromWindow) {
      if (!e || e.defaultPrevented) return;
      const t = e.target;
      const tag = (t && t.tagName) || '';
      const typing = deskHotkeys.isTypingTarget(tag, t && t.isContentEditable);
      const hit = deskHotkeys.resolveDeskHotkey(e, {
        typing: typing,
        fromWindow: !!fromWindow
      });
      if (!hit) return;
      if (hit.preventDefault) e.preventDefault();

      switch (hit.action) {
        case 'escape':
          if (this.searchKey) this.searchKey = '';
          if (typing && t && typeof t.blur === 'function') t.blur();
          break;
        case 'focus_market_search':
          this.focusMarketSearch();
          break;
        case 'focus_buy_ticket':
          this.focusTicket('BUY');
          break;
        case 'focus_sell_ticket':
          this.focusTicket('SELL');
          break;
        case 'focus_ticket':
          this.focusTicket();
          break;
        case 'cancel_last_open':
          this.cancelLastOpenOrder();
          break;
        case 'submit':
          /* Field @keydown.enter.prevent also calls submitOrder; defaultPrevented
             on the bubbled event skips a second resolve. This path is for
             direct/tests and any non-prevented field bubble. */
          this.submitOrder();
          break;
        default:
          break;
      }
    },

    focusMarketSearch() {
      const el = this.$refs.marketSearch;
      if (el && typeof el.focus === 'function') {
        el.focus();
        if (typeof el.select === 'function') el.select();
      }
    },

    /**
     * Focus the order ticket; optional side flips Buy/Sell first (clears amount via setSide).
     * Prefers price (limit) then amount — real inputs only, no invented values.
     * @param {'BUY'|'SELL'|undefined} side
     */
    focusTicket(side) {
      if ((side === 'BUY' || side === 'SELL') && this.side !== side) {
        this.setSide(side);
      }
      this.$nextTick(() => {
        const priceEl = this.$refs.ticketPrice;
        const amountEl = this.$refs.ticketAmount;
        let el = null;
        if (this.orderType === 'LIMIT_PRICE' && priceEl && !priceEl.disabled) {
          el = priceEl;
        } else if (amountEl) {
          el = amountEl;
        }
        if (el && typeof el.focus === 'function') {
          el.focus();
          if (typeof el.select === 'function') el.select();
          return;
        }
        const panel =
          typeof document !== 'undefined' ? document.getElementById('ix-ticket') : null;
        if (panel && typeof panel.focus === 'function') panel.focus();
      });
    },

    /**
     * A-UI-SUB — selection changed in the header switcher.
     * Does not touch balances or order payload; tradeBlockReason handles gating.
     */
    onSubAccountChange() {
      var reason = subAccounts.tradeBlockReason(this.$store.state.ixSubAccountId);
      if (reason) {
        this.orderValidationError = reason;
        this.liveAnnounce = reason;
      } else if (
        this.orderValidationError &&
        this.orderValidationError.indexOf('Sub-account selected') === 0
      ) {
        this.orderValidationError = '';
        this.liveAnnounce = '';
      }
    },

    /**
     * Cancel the most recent open order via existing cancelOrder (confirm modal).
     * Does not invent order ids or skip venue confirm.
     */
    cancelLastOpenOrder() {
      if (this.cancellingId) return;
      if (!this.isLogin) {
        return this.warn('Sign in to cancel orders.');
      }
      if (!this.ordersReachable) {
        return this.warn('Open orders unknown — cannot cancel from keyboard.');
      }
      const list = this.openOrders || [];
      if (!list.length) {
        return this.warn('{{ $t("exchange.residual.noOpenOrders") }} to cancel.');
      }
      let order = list[0];
      for (let i = 1; i < list.length; i++) {
        const row = list[i];
        if (row && order && Number(row.time) > Number(order.time)) {
          order = row;
        }
      }
      if (!order || !order.orderId) {
        return this.warn('No cancellable open order found.');
      }
      this.accountTab = 'open';
      this.cancelOrder(order);
    },

    /* REMOVED: request(). It POSTed to the Java backend through `this.$http`
       and flattened every outcome to `null`, which is why "the service refused"
       and "there is nothing here" were indistinguishable everywhere it was
       used. `rest()` from config/intafaced.js replaces it: it also never
       rejects, but it resolves a classified `{ ok, reason, message, data }` so
       each caller can tell a refusal from an empty answer. */

    /* Wave B5 — persist non-money desk chrome (pair lives in the URL). Local-only. */
    deskPrefsKey() {
      return 'ix.desk.prefs.v1';
    },
    loadDeskPrefs() {
      try {
        const raw = window.localStorage.getItem(this.deskPrefsKey());
        if (!raw) return;
        const p = JSON.parse(raw);
        if (!p || typeof p !== 'object') return;
        const modes = { all: 1, bids: 1, asks: 1 };
        if (modes[p.bookMode]) this.bookMode = p.bookMode;
        if ([1, 10, 50, 100].indexOf(Number(p.bookGroup)) >= 0) {
          this.bookGroup = Number(p.bookGroup);
        }
        const ivals = this.intervals.map(i => i.value);
        if (ivals.indexOf(p.interval) >= 0) this.interval = p.interval;
        const mains = { chart: 1, depth: 1, book: 1, trades: 1 };
        if (mains[p.mainTab]) this.mainTab = p.mainTab;
        const rails = { book: 1, trades: 1 };
        if (rails[p.railTab]) this.railTab = p.railTab;
        if (typeof p.baseFilter === 'string' && p.baseFilter) {
          this.baseFilter = p.baseFilter;
        }
        if (typeof p.pair === 'string' && /^[a-z0-9]+_[a-z0-9]+$/i.test(p.pair)) {
          this.defaultPair = p.pair.toLowerCase();
        }
        /* B5 — blotter tab + ticket side are non-money chrome. */
        const accts = { balances: 1, positions: 1, open: 1, fills: 1, history: 1 };
        if (accts[p.accountTab]) this.accountTab = p.accountTab;
        if (p.side === 'BUY' || p.side === 'SELL') this.side = p.side;
        /* B5 — panel pixel widths (clamped; never invent money). */
        if (p.panels && typeof p.panels === 'object') {
          this.panelW = deskPrefs.normalizePanelWidths(p.panels);
        }
      } catch (e) {
        /* private mode / bad JSON — leave defaults */
      }
    },
    saveDeskPrefs() {
      try {
        const pair =
          (this.$route && this.$route.params && this.$route.params.pair) ||
          this.defaultPair;
        window.localStorage.setItem(
          this.deskPrefsKey(),
          JSON.stringify({
            pair: String(pair || this.defaultPair).toLowerCase(),
            bookMode: this.bookMode,
            bookGroup: this.bookGroup,
            interval: this.interval,
            mainTab: this.mainTab,
            railTab: this.railTab,
            baseFilter: this.baseFilter,
            accountTab: this.accountTab,
            side: this.side,
            panels: deskPrefs.normalizePanelWidths(this.panelW)
          })
        );
      } catch (e) {
        /* ignore quota / private mode */
      }
    },
    /** B5 — drag splitter; markets grow with +delta; rail/order use west edge (−delta). */
    startPanelResize(key, e) {
      if (!this.panelResizeActive || !e || typeof window === 'undefined') return;
      var startX = e.clientX;
      var startW = deskPrefs.clampPanelWidth(key, this.panelW[key]);
      var sign = key === 'markets' ? 1 : -1;
      var self = this;
      function onMove(ev) {
        if (!ev) return;
        var next = deskPrefs.panelWidthAfterDrag(key, startW, sign * (ev.clientX - startX));
        self.$set(self.panelW, key, next);
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove, true);
        window.removeEventListener('mouseup', onUp, true);
        document.body.classList.remove('ix-resizing-cols');
        self.saveDeskPrefs();
      }
      document.body.classList.add('ix-resizing-cols');
      window.addEventListener('mousemove', onMove, true);
      window.addEventListener('mouseup', onUp, true);
    },
    syncPanelResizeActive() {
      if (typeof window === 'undefined') return;
      this.panelResizeActive = window.innerWidth >= 1500;
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
      /* Keep a remembered market-list filter when it is "favor"; otherwise
         follow the pair's quote so the list matches the desk. */
      if (this.baseFilter !== 'favor') {
        this.baseFilter = base;
      }
      this.saveDeskPrefs();
      this.trend = 0;
      this.lastTick = 0;
      this.chartFailed = false;
      this.feeKnown = false;
      this.marketsLoading = false;
      this.marketsReachable = false;
      this.bookLoading = true;
      this.bookReachable = false;
      this.tradesLoading = true;
      this.tradesReachable = false;
      this.plate = { asks: [], bids: [], askTotal: 0, bidTotal: 0 };
      this.trades = [];
      this.percent = 0;
      this.form = { price: '', amount: '' };
      this.orderValidationError = '';

      this.$store.commit('navigate', 'nav-exchange');
      this.$store.commit('setSkin', 'night');

      this.loadFavorites();
      this.getMarkets();
      this.getPlate();
      this.getTrades();
      this.loadAccount();

      /* The chart needs the price scale, so it waits for the listing — but
         only once, and it starts even when that request fails. */
      this.getSymbolScale().then(() => {
        this.$nextTick(() => this.mountChart());
      });
    },

    teardown() {
      this.destroyChart();
      clearTimeout(this.depthTimer);
      this.depthTimer = 0;
      this.depthPending = false;
    },

    /* ── chart ─────────────────────────────────────────────────────────── */

    mountChart() {
      const host = document.getElementById('ix_kline');
      if (!host) {
        return;
      }
      this.destroyChart();
      this.chartFailed = false;

      const chart = new KlineChart({
        hostEl: host,
        /* The CCXT REST base. The chart appends /ohlcv/<symbol>. */
        baseUrl: REST_BASE,
        symbol: this.currentCoin.symbol,
        resolution: this.interval,
        stompClient: null,
        scale: this.baseCoinScale
      });
      this.klineChart = chart;
      chart
        .mount()
        .then((status) => {
          if (this._isDestroyed || this.klineChart !== chart) {
            return;
          }
          /* Three states, three sentences. 'empty' is a market that has never
             traded and is NOT a failure; conflating the two is what made a
             dead data source look identical to a quiet market. */
          this.chartStatus = status;
          this.chartFailed = status === 'failed';
        })
        .catch(() => {
          if (this.klineChart === chart) {
            this.chartStatus = 'failed';
            this.chartFailed = true;
          }
        });
    },

    destroyChart() {
      if (this.klineChart) {
        try {
          this.klineChart.dispose();
        } catch (e) {
          const host = document.getElementById('ix_kline');
          if (host) {
            host.innerHTML = '';
          }
        }
        this.klineChart = null;
      }
    },

    setChartInterval(value) {
      this.interval = value;
      if (!this.klineChart) {
        return;
      }
      this.klineChart.setResolution(value).then((status) => {
        this.chartStatus = status;
        this.chartFailed = status === 'failed';
      }, () => {
        this.chartStatus = 'failed';
        this.chartFailed = true;
      });
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

    /* REMOVED: getCNYRate(). It read `/market/exchange-rate/usd-cny` on the
       retired Java market service. This platform publishes no FX rate source,
       so `CNYRate` stays null and `fiatValue` (which already guards on it)
       renders nothing. A fiat conversion from a rate we invented is a price. */

    /* REMOVED: getCoinInfo(). `/market/coin-info` returned vendor CMS copy about
       an asset (description, links, block explorer). We publish no such
       surface, and `coinInfo` stays `{}` — the panels reading it already guard. */

    /**
     * Market rules from `GET /api/v1/markets` — the venue's own listing table.
     *
     * TICK AND LOT, NOT DECIMAL PLACES. Our contract publishes
     * `precisionMode: 'TICK_SIZE'` with the tick and lot themselves, because
     * that is what the engine enforces. The desk needs a decimal-place count to
     * format and clamp input, so it derives one FROM the tick — and that is a
     * display convenience only. It is never used to build an order quantity:
     * seven of our listings have a lot size of 1000 or 10, whose decimal-place
     * count is 0, and rounding an amount to 0 places would produce sizes the
     * engine rejects for a reason the trader cannot see.
     */
    getSymbolScale() {
      return rest('/markets').then(res => {
        if (!res.ok) {
          return;
        }
        const gate = ixTrade.accept(ixTrade.schemas.markets, res.data);
        if (!gate.ok || !Array.isArray(gate.data)) {
          return;
        }
        const market = gate.data.filter(m => m.symbol === this.currentCoin.symbol)[0];
        if (!market) {
          return;
        }
        this.market = market;
        /* Handles BOTH published precision shapes — the tick/lot strings on
           main and the decimal-place integers the deployed service still
           sends. Reading one as the other formats every price on the desk to
           the wrong number of digits, silently. See ix-trade.js. */
        const pricePlaces = market.precision ? ixTrade.placesFromPrecision(market.precision.price) : null;
        const amountPlaces = market.precision ? ixTrade.placesFromPrecision(market.precision.amount) : null;
        if (pricePlaces !== null) this.baseCoinScale = pricePlaces;
        if (amountPlaces !== null) this.coinScale = amountPlaces;
        /* Taker rate as a decimal string ("0.001"). Known only because the
           venue published it — feeKnown stays false otherwise and the ticket
           says the fee is unknown rather than implying it is free. */
        if (market.taker != null) {
          this.symbolFee = market.taker;
          this.feeKnown = true;
        }
        /* `active: false` is an operator halt. Market orders are supported on
           this venue for both sides; there is no per-side switch in the
           contract, so nothing is invented here. */
        const tradable = market.active !== false ? 1 : 0;
        this.enableMarketBuy = tradable;
        this.enableMarketSell = tradable;
        this.exchangeable = tradable;
      });
    },


    /**
     * The market list — `/markets` for the listing, `/tickers` for prices.
     *
     * Every 24h rollup our ticker publishes is null (no windowed aggregation
     * job exists) and `last` is null until a market prints. Those stay null:
     * `marketNum`/`marketStat` already render null as a dash, and a table of
     * green +0.00% would claim sixteen flat markets.
     */
    getMarkets() {
      this.marketsLoading = true;
      this.marketsReachable = false;
      Promise.all([rest('/markets'), rest('/tickers')]).then(results => {
        const marketsRes = results[0];
        const tickersRes = results[1];
        this.marketsLoading = false;
        if (!marketsRes.ok) {
          this.marketsReachable = false;
          return;
        }
        const marketsGate = ixTrade.accept(ixTrade.schemas.markets, marketsRes.data);
        if (!marketsGate.ok || !Array.isArray(marketsGate.data)) {
          this.marketsReachable = false;
          return;
        }
        this.marketsReachable = true;
        /* Tickers can fail on their own. The listing is still true, so markets
           are shown priceless rather than hidden. A shape failure on tickers is
           treated the same as a transport failure: listing without prices. */
        var tickers = {};
        if (tickersRes.ok) {
          var tickersGate = ixTrade.accept(ixTrade.schemas.tickers, tickersRes.data);
          if (tickersGate.ok && tickersGate.data) tickers = tickersGate.data;
        }
        const rows = ixTrade.toMarketRows(marketsGate.data, tickers);
        const map = {};
        rows.forEach(row => {
          row.isFavor = this.localFavorites.indexOf(row.symbol) >= 0;
          map[row.symbol] = row;
        });
        this.markets = rows;
        this.marketMap = map;

        const current = map[this.currentCoin.symbol];
        if (current) {
          this.currentCoin = Object.assign({}, this.currentCoin, current);
          /* Seed the limit price from the last print ONLY if there is one.
             bookPriceForForm keeps the venue decimal string (truncate/pad),
             never parseFloat().toFixed(). Empty book → no prefill of 0. */
          if (!this.form.price && current.close) {
            var seeded = ixMoney.bookPriceForForm(current.close, this.baseCoinScale);
            if (seeded) this.form.price = seeded;
          }
        }
        this.currentCoinIsFavor = this.localFavorites.indexOf(this.currentCoin.symbol) >= 0;
      });
    },

    /**
     * The order book — `GET /api/v1/orderbook/:symbol`.
     *
     * A 200 with empty bids and asks is the venue answering "nothing is resting
     * here", which is the true state of every book on this platform today. It
     * sets `bookReachable = true` and the ladder renders its empty state. Only
     * a refusal clears reachability, and then the ladder says the book is
     * unknown instead of empty.
     */
    getPlate() {
      rest('/orderbook/' + symbolPath(this.currentCoin.symbol), { query: { limit: BOOK_DEPTH } }).then(res => {
        this.bookLoading = false;
        if (!res.ok) {
          /* Unreachable — clear any prior levels so we never paint a stale book. */
          this.bookReachable = false;
          this.bookMessage = res.message || '';
          this.plate = { asks: [], bids: [], askTotal: '0', bidTotal: '0' };
          return;
        }
        const gate = ixTrade.accept(ixTrade.schemas.orderBook, res.data);
        if (!gate.ok) {
          /* Shape failure (e.g. float levels) — not an empty book. */
          this.bookReachable = false;
          this.bookMessage = gate.message || '';
          this.plate = { asks: [], bids: [], askTotal: '0', bidTotal: '0' };
          return;
        }
        this.bookReachable = true;
        this.bookMessage = '';
        const book = gate.data || {};
        this.applyPlate('SELL', ixTrade.toPlateItems(book.asks));
        this.applyPlate('BUY', ixTrade.toPlateItems(book.bids));
      });
    },

    bookSideEmpty(side) {
      return bookHonesty.bookSideEmptyLabel({
        loading: this.bookLoading,
        reachable: this.bookReachable,
        side: side
      });
    },

    /* One shape for both the REST snapshot and the websocket delta, so the
       book cannot drift between the two sources. Asks are stored best-last.
       Invalid (≤0) levels are dropped — never pad with zero-price placeholders. */
    applyPlate(direction, items) {
      /* normalizePlateLevels owns decimal totals via ix-money; no num callback. */
      const rows = bookHonesty.normalizePlateLevels(items, BOOK_DEPTH);
      const total = rows.length ? rows[rows.length - 1].totalAmount : '0';
      if (direction === 'SELL') {
        this.plate.asks = rows.slice().reverse();
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

      rest('/orderbook/' + symbolPath(this.currentCoin.symbol), { query: { limit: DEPTH_LEVELS } }).then(res => {
        if (!this.$refs.depthGraph) {
          return;
        }
        if (!res.ok) {
          /* Do not redraw from stale state — an empty depth chart is honest,
             a stale one is not. */
          this.$refs.depthGraph.draw({});
          return;
        }
        const gate = ixTrade.accept(ixTrade.schemas.orderBook, res.data);
        if (!gate.ok) {
          this.$refs.depthGraph.draw({});
          return;
        }
        const book = gate.data || {};
        /* DepthGraph expects the vendor's { ask: { items }, bid: { items } }. */
        this.$refs.depthGraph.draw({
          ask: { items: ixTrade.toPlateItems(book.asks) },
          bid: { items: ixTrade.toPlateItems(book.bids) }
        });
      });
    },

    /**
     * The public tape — `GET /api/v1/trades/:symbol`.
     *
     * `[]` means this market has never printed. That is an answer, so
     * `tradesReachable` is true and the tape renders "no trades yet" rather
     * than "trades unavailable".
     */
    getTrades() {
      rest('/trades/' + symbolPath(this.currentCoin.symbol), { query: { limit: TRADE_LIMIT } }).then(res => {
        this.tradesLoading = false;
        if (!res.ok) {
          this.tradesReachable = false;
          this.tradesMessage = res.message || '';
          this.trades = [];
          return;
        }
        const gate = ixTrade.accept(ixTrade.schemas.trades, res.data);
        if (!gate.ok) {
          this.tradesReachable = false;
          this.tradesMessage = gate.message || '';
          this.trades = [];
          return;
        }
        this.tradesReachable = true;
        this.tradesMessage = '';
        this.trades = ixTrade.toDeskTrades(gate.data, TRADE_LIMIT);
      });
    },

    /* ── live feed ─────────────────────────────────────────────────────── */

    /* REMOVED: startWebsock / stopWebsock / subscribeTopics.

       They opened a SockJS/STOMP connection to `/market/market-ws` on the
       retired Java market service and subscribed to five topics: thumb
       tickers, the trade tape, the trade plate, and three per-user order
       events that re-read the account on every fill.

       NOT REPOINTED. Our live feed is svc-ws, a different protocol on a
       different service, and wiring it is a piece of work in its own right
       rather than a URL swap. Leaving the STOMP client in place would have
       been worse than removing it: against a dead host it reconnects, and a
       desk that looks connected while receiving nothing is a desk showing a
       stale book with no indication that it is stale.

       WHAT THE ABSENCE COSTS, STATED PLAINLY. `feedLive` stays false, so
       every headline figure renders through marketNum/marketStat and prints
       a dash rather than a stale number. The book and tape are REST snapshots
       taken when the pair loaded; they do not tick. The blotter refreshes
       after your own order actions because those call loadAccount() directly.
       Nothing on this screen claims to stream. */

    /* ── account ───────────────────────────────────────────────────────── */

    /* ── account ───────────────────────────────────────────────────────── */

    /**
     * The account panel — balances, open orders, closed orders, fills.
     *
     * GATED ON THE PLATFORM SESSION, NOT THE SHELL LOGIN. `isLogin` is the
     * vendored ucenter session; `ixToken` is the platform session svc-edge will
     * accept. They are different, and a reader signed in to the first sees a
     * named "{{ $t("exchange.residual.noPlatformSession") }}" refusal rather than an empty blotter that
     * reads as "you have no orders".
     */
    loadAccount() {
      if (!this.ixToken) {
        this.accountLoading = false;
        this.walletReachable = false;
        this.ordersReachable = false;
        this.accountError = this.$t('intafaced.trade.noSession');
        return;
      }
      this.accountLoading = true;
      this.accountError = '';
      this.walletReachable = false;
      this.ordersReachable = false;
      Promise.all([
        this.getWallet(),
        this.getOpenOrders(),
        this.getHistoryOrders(),
        this.getMyFills()
      ]).then(() => {
        this.accountLoading = false;
        if (!this.walletReachable && !this.ordersReachable) {
          this.accountError =
            (this.accountRefusal || 'The platform did not answer.') +
            ' Balances and orders are not shown as zero — they are unknown.';
        }
      });
    },

    /** Remember the first named refusal so the panel can quote a reason. */
    noteRefusal(res) {
      if (!res.ok && !this.accountRefusal) {
        this.accountRefusal = res.message || '';
      }
    },

    /**
     * Balances — `GET /api/v1/account/balance`, the ledger projection.
     *
     * ONE CALL, NOT TWO. The vendor read a per-asset wallet endpoint twice
     * (base and quote) and only trusted the pair when BOTH legs answered,
     * because one dead leg had painted a false available 0. Our endpoint
     * returns every asset in one answer, so that failure mode is gone: either
     * we have the whole picture or we have none of it.
     *
     * An asset with no ledger row is NOT zero — it means the ledger has never
     * held it for this user. `freeBalanceOf` returns null and the ticket says
     * the balance is unknown rather than sizing an order against a fiction.
     */
    getWallet() {
      this.walletReachable = false;
      return rest('/account/balance', { token: this.ixToken }).then(res => {
        this.noteRefusal(res);
        if (!res.ok) {
          return;
        }
        const gate = ixTrade.accept(ixTrade.schemas.balances, res.data);
        if (!gate.ok) {
          this.noteRefusal(gate);
          return;
        }
        const rows = ixTrade.toBalanceRows(gate.data);
        this.balances = rows;
        this.wallet = {
          base: ixTrade.freeBalanceOf(rows, this.currentCoin.base),
          coin: ixTrade.freeBalanceOf(rows, this.currentCoin.coin)
        };
        this.walletReachable = true;
      });
    },

    getOpenOrders() {
      return rest('/orders/open', {
        token: this.ixToken,
        query: { symbol: this.currentCoin.symbol }
      }).then(res => {
        this.noteRefusal(res);
        if (!res.ok) {
          return;
        }
        const gate = ixTrade.accept(ixTrade.schemas.orders, res.data);
        if (!gate.ok) {
          this.noteRefusal(gate);
          return;
        }
        // A 200 with [] is "you have none" — a real answer, so reachable.
        this.openOrders = ixTrade.toDeskOrders(gate.data);
        this.ordersReachable = true;
      });
    },

    getHistoryOrders() {
      return rest('/orders/closed', {
        token: this.ixToken,
        query: { symbol: this.currentCoin.symbol, limit: 100 }
      }).then(res => {
        this.noteRefusal(res);
        if (!res.ok) {
          return;
        }
        const gate = ixTrade.accept(ixTrade.schemas.orders, res.data);
        if (!gate.ok) {
          this.noteRefusal(gate);
          return;
        }
        this.historyOrders = ixTrade.toDeskOrders(gate.data);
        this.ordersReachable = true;
      });
    },

    /**
     * My fills — `GET /api/v1/account/trades`.
     *
     * A SEPARATE CALL, WHICH IT DID NOT USED TO BE. The vendor's Trade History
     * tab read `order.detail[]` embedded in each history order. Our order wire
     * carries no nested fills, so deriving the tab from it would have shown an
     * empty fill list for orders that genuinely traded — the exact "zero that
     * reads as a real value" this work exists to remove.
     */
    getMyFills() {
      return rest('/account/trades', {
        token: this.ixToken,
        query: { symbol: this.currentCoin.symbol, limit: 100 }
      }).then(res => {
        this.noteRefusal(res);
        if (!res.ok) {
          this.fillsReachable = false;
          return;
        }
        const gate = ixTrade.accept(ixTrade.schemas.trades, res.data);
        if (!gate.ok) {
          this.noteRefusal(gate);
          this.fillsReachable = false;
          return;
        }
        this.myFills = ixTrade.toDeskFills(gate.data);
        this.fillsReachable = true;
      });
    },

    /* ── interactions ──────────────────────────────────────────────────── */

    openPair(row) {
      if (!row || row.symbol === this.currentCoin.symbol) {
        return;
      }
      this.$router.push({ name: 'ExchangePair', params: { pair: row.href } });
    },

    /**
     * Fold the book into N×10^(-scale) buckets. N=1 is the raw book.
     *
     * NOT DISPLAY-ONLY, WHICH IS WHY IT IS DECIMAL NOW. A grouped row is still
     * clickable, and `useBookPrice` copies its price into the order form — so
     * the bucket price computed here can reach `POST /orders`. It used to be
     * `Math.floor(px / step) * step` on floats, then `toFixed`: a bucket
     * boundary that lands one ulp low puts the row in the wrong bucket, and the
     * `toFixed` re-rounds the boundary itself. Every step below is BigNumber and
     * every price out is a decimal string.
     *
     * Bids fold DOWN and asks fold UP, both away from the spread, so a grouped
     * level never claims a better price than the depth behind it.
     */
    groupPlate(rows, side) {
      var list = rows || [];
      var g = Math.floor(Number(this.bookGroup) || 1);
      if (g <= 1 || list.length === 0) return list;
      /* Scale is a property of the instrument. No published precision → leave
         the book ungrouped rather than invent a two-decimal bucket width. */
      var scale = this.baseCoinScale;
      if (scale == null || !isFinite(Number(scale))) return list;
      /* The bucket width as a decimal string: g ticks of 10^-scale. */
      var step = ixMoney.multiply(String(g), '1e-' + scale, scale);
      if (step === null || !ixMoney.isPositive(step)) return list;
      var map = {};
      var order = [];
      for (var i = 0; i < list.length; i++) {
        var row = list[i];
        /* divide(_, _, 0) truncates toward zero, and book prices are positive,
           so this is floor. Null means the level was unreadable — drop it
           rather than folding it into a bucket it does not belong to. */
        var index = ixMoney.divide(row.price, step, 0);
        if (index === null) continue;
        if (side !== 'bid' && ixMoney.compare(ixMoney.multiply(index, step, scale), row.price) !== 0) {
          /* An ask that does not sit exactly on a boundary folds up. */
          index = ixMoney.add(index, '1');
        }
        var key = ixMoney.multiply(index, step, scale);
        if (key === null) continue;
        if (!map[key]) {
          map[key] = { price: key, amount: '0', totalAmount: '0' };
          order.push(key);
        }
        /* Preserves the vendor's summing semantics exactly — see the PR note on
           the cumulative column, which this change deliberately does not alter. */
        map[key].amount = ixMoney.add(map[key].amount, row.amount) || map[key].amount;
        var cumulative = row.totalAmount != null ? row.totalAmount : row.amount;
        map[key].totalAmount = ixMoney.add(map[key].totalAmount, cumulative) || map[key].totalAmount;
      }
      return order.map(function (k) { return map[k]; });
    },

    /**
     * Click a book row → its price in the limit input.
     *
     * THE VENUE'S OWN DECIMAL STRING, truncated to the market's price
     * precision. This was `fmt(parseFloat(row.price), scale)`, which both
     * re-encoded the quote through a binary double and ROUNDED it — 1.45 at one
     * place became 1.5, and the buy button then offered a price the venue never
     * quoted. `bookPriceForForm` answers null for a level that is not real
     * depth, and null leaves the form untouched rather than blanking it.
     */
    useBookPrice(row) {
      const price = ixMoney.bookPriceForForm(row.price, this.baseCoinScale);
      if (price === null) {
        return;
      }
      this.orderType = 'LIMIT_PRICE';
      this.form.price = price;
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

    /**
     * The size behind the 25/50/75/100% buttons — the second half of the money
     * path, and the one that used to be float all the way through.
     *
     * It was `(availableBalanceNum * percent) / 100` on a parsed balance, then
     * `budget / price`, then `Math.floor(n * 10**scale) / 10**scale`. Three
     * lossy operations, and the result went into `form.amount` and straight out
     * to `POST /orders`. A 100% sell has to come out as a size the ledger's own
     * balance covers exactly: one ulp over is a rejection the trader cannot
     * explain, one ulp under quietly strands dust.
     *
     * `percentSize` takes the balance as the STRING the ledger sent, does every
     * step in BigNumber and truncates once at the end. Null in means an unknown
     * balance or an unusable price, and null clears the box — it never sizes
     * against a balance that does not exist.
     */
    applyPercent() {
      if (!this.canSize || this.percent <= 0) {
        if (this.percent <= 0) {
          this.form.amount = '';
        }
        return;
      }
      const quoteSized = this.quoteSized;
      const size = ixMoney.percentSize({
        balance: this.availableBalance,
        percent: this.percent,
        scale: quoteSized ? this.baseCoinScale : this.coinScale,
        /* A limit/market BUY sized in the base asset spends quote at the limit
           price. A SELL and a quote-sized market BUY are already denominated in
           the asset being sized, so there is nothing to divide by. */
        divideBy: quoteSized || this.side === 'SELL' ? null : this.form.price
      });
      this.form.amount = size === null ? '' : size;
    },

    onPriceInput() {
      this.form.price = this.clamp(this.form.price, this.baseCoinScale);
      this.orderValidationError = '';
      if (this.percent > 0) {
        this.applyPercent();
      }
    },

    onAmountInput() {
      this.form.amount = this.clamp(this.form.amount, this.quoteSized ? this.baseCoinScale : this.coinScale);
      this.percent = 0;
      this.orderValidationError = '';
    },

    /**
     * Inline validation — prefer a named reason over a silent disabled button.
     * Never invent fees or balances; wallet unknown stays "unknown", not zero.
     */
    validateOrderFields() {
      const amountRaw = String(this.form.amount || '').trim();
      const priceRaw = String(this.form.price || '').trim();
      if (!amountRaw) return 'Enter an amount.';
      if (/[eE]/.test(amountRaw) || /[eE]/.test(priceRaw)) {
        return 'Scientific notation is not accepted — use a plain decimal.';
      }
      if (!ixMoney.isPositive(amountRaw)) return 'Enter a valid amount greater than zero.';
      if (ixMoney.greaterThan(amountRaw, '1000000000000')) return 'Amount is too large.';
      if (this.orderType === 'LIMIT_PRICE') {
        if (!priceRaw) return 'Enter a limit price.';
        if (!ixMoney.isPositive(priceRaw)) return 'Enter a valid limit price greater than zero.';
        if (ixMoney.greaterThan(priceRaw, '1000000000000')) return 'Price is too large.';
      }
      /* Cost for the insufficient-balance check only — not a wire amount. */
      var costStr = this.quoteSized
        ? amountRaw
        : this.side === 'BUY'
          ? ixMoney.multiply(priceRaw, amountRaw)
          : amountRaw;
      if (
        this.isLogin &&
        this.walletReachable &&
        costStr !== null &&
        ixMoney.isPositive(this.availableBalance) &&
        ixMoney.greaterThan(costStr, this.availableBalance)
      ) {
        return 'Insufficient balance. Available ' + this.availableBalance + '.';
      }
      return '';
    },

    /**
     * A-UI-A11Y / B10 — GOV.UK: move keyboard focus to error summary;
     * LiveAnnouncer-style clear-then-set when the same message re-fires.
     */
    focusOrderError(msg) {
      var next = msg || this.orderValidationError || '';
      this.orderValidationError = next;
      var plan = deskA11y.liveAnnounceUpdate(this.liveAnnounce, next);
      var self = this;
      var afterAnnounce = function () {
        self.$nextTick(function () {
          self.focusErrorSummary();
        });
      };
      if (plan.needsClearFirst) {
        this.liveAnnounce = '';
        this.$nextTick(function () {
          self.liveAnnounce = plan.text;
          afterAnnounce();
        });
      } else {
        this.liveAnnounce = plan.text;
        afterAnnounce();
      }
    },

    /** Focus the GOV.UK error summary (not a field) so AT and keyboard land first. */
    focusErrorSummary() {
      var el = this.$refs.orderErrorSummary;
      if (el && typeof el.focus === 'function') {
        el.focus();
      }
    },

    /** Error-summary link → associated field (amount or price). */
    focusTicketErrorField() {
      var summary = this.orderErrorSummary;
      if (!summary || !summary.fieldId) {
        return this.focusErrorSummary();
      }
      var el =
        summary.field === 'price'
          ? this.$refs.ticketPrice
          : summary.field === 'amount'
            ? this.$refs.ticketAmount
            : null;
      if (el && !el.disabled && typeof el.focus === 'function') {
        el.focus();
        if (typeof el.select === 'function') el.select();
        return;
      }
      this.focusErrorSummary();
    },

    submitOrder() {
      if (!this.tradable || this.submitting) {
        return;
      }
      if (this.orderBlockReason) {
        this.focusOrderError(this.orderBlockReason);
        return this.warn(this.orderBlockReason);
      }
      const fieldErr = this.validateOrderFields();
      if (fieldErr) {
        this.focusOrderError(fieldErr);
        return this.warn(fieldErr);
      }
      this.orderValidationError = '';
      this.liveAnnounce = '';

      const amount = this.num(this.form.amount);
      const price = this.num(this.form.price);

      const side = this.side === 'BUY' ? this.$t('exchange.terminal.buy') : this.$t('exchange.terminal.sell');
      const type = this.orderType === 'MARKET_PRICE' ? this.$t('exchange.terminal.typeMarket') : this.$t('exchange.terminal.typeLimit');
      const priceLine =
        this.orderType === 'MARKET_PRICE'
          ? this.$t('exchange.terminal.confirmPriceBest')
          : this.$t('exchange.terminal.confirmPriceLine', { price: this.fmt(price, this.baseCoinScale) + ' ' + (this.currentCoin.base || '') });
      const amountLine =
        this.amountLabel +
        ': ' +
        this.fmt(amount, this.quoteSized ? this.baseCoinScale : this.coinScale) +
        ' ' +
        (this.amountUnit || '');
      const feeLine = this.$t('exchange.terminal.feeEst') + ': ' + this.feeLabel;
      /* Three states, again — an "Available: 0" on a confirmation dialog for a
         balance we could not read is the last place a fabricated number should
         appear, because it is the screen someone reads before committing. */
      const walletLine = !this.walletReachable
        ? this.$t('exchange.residual.availableUnknown')
        : this.availableBalance === null
          ? this.$t('exchange.residual.availableNoRow', { unit: this.side === 'BUY' ? this.currentCoin.base : this.currentCoin.coin })
          : this.$t('exchange.residual.availableLedger') + ': ' + this.availableBalance;
      const pair = (this.currentCoin.coin || '') + '/' + (this.currentCoin.base || '');

      this.$Modal.confirm({
        title: this.$t('exchange.terminal.confirmTitle', { side: side.toLowerCase() }),
        // i18n-exempt HTML shell; all user copy via $t / dynamic fee/price lines above
        content:
          '<p><strong>' +
          side +
          ' · ' +
          type +
          '</strong> · ' +
          pair +
          '</p><p>' +
          priceLine +
          '</p><p>' +
          amountLine +
          '</p><p>' +
          feeLine +
          '</p><p>' +
          walletLine +
          '</p><p style="margin-top:8px;opacity:0.75;">' + this.$t('exchange.residual.confirmDisclaimerVenue') + '</p>',
        okText: side,
        cancelText: this.$t('exchange.terminal.cancel'),
        /* No arguments: placeOrder reads the decimal STRINGS out of the form.
           `amount` and `price` above are floats parsed for this dialog's copy
           and must not reach the wire. */
        onOk: () => this.placeOrder()
      });
    },

    /**
     * PLACE AN ORDER — `POST /api/v1/orders`. The money path.
     *
     * AMOUNT AND PRICE GO OUT AS THE STRINGS THE USER TYPED. `submitOrder`
     * hands this method parsed numbers for the confirmation copy; they are NOT
     * what is sent. `this.form.amount` and `this.form.price` are the decimal
     * strings from the input, the contract's schema takes decimal strings, and
     * the ledger parses them to a scaled bigint. Routing an order size through
     * a JS float would round it at the seventeenth significant digit — silently,
     * and on exactly the values where it matters.
     *
     * A market order carries no price key at all. The schema rejects a price on
     * a market order, and the old `price: 0` was in any case a price we made up.
     */
    placeOrder() {
      if (!this.ixToken) {
        const sessionMsg = this.$t('intafaced.trade.noSession');
        this.focusOrderError(sessionMsg);
        return this.warn(sessionMsg);
      }
      var subBlock = subAccounts.tradeBlockReason(this.$store.state.ixSubAccountId);
      if (subBlock) {
        this.focusOrderError(subBlock);
        return this.warn(subBlock);
      }
      this.submitting = true;
      const body = ixTrade.toCreateOrderBody({
        symbol: this.currentCoin.symbol,
        type: this.orderType,
        side: this.side,
        amount: String(this.form.amount).trim(),
        price: String(this.form.price).trim()
      });
      return rest('/orders', { method: 'POST', token: this.ixToken, body: body }).then(res => {
        this.submitting = false;
        if (res.ok) {
          this.orderValidationError = '';
          this.liveAnnounce = '';
          this.$Notice.success({ title: this.$t('intafaced.trade.placed'), desc: this.submitLabel });
          this.form.amount = '';
          this.percent = 0;
          this.accountTab = 'open';
          this.loadAccount();
          return;
        }
        /* Reject copy goes in the ticket, not only a toast, so the form never
           looks like it succeeded. Every message ends by saying no order was
           placed — an ambiguous failure gets an order placed twice. */
        const rejectMsg = ixTrade.orderFailureMessage(res, 'create');
        this.focusOrderError(rejectMsg);
        this.$Notice.error({ title: this.$t('intafaced.trade.rejected'), desc: rejectMsg });
      });
    },

    cancelOrder(order) {
      if (this.cancellingId) return;
      this.$Modal.confirm({
        title: this.$t('exchange.terminal.cancelOrderTitle'),
        content: this.$t('exchange.terminal.cancelOrderConfirm'),
        onOk: () => {
          if (this.cancellingId) return;
          this.cancellingId = order.orderId;
          return rest('/orders/' + encodeURIComponent(order.orderId), {
            method: 'DELETE',
            token: this.ixToken
          }).then(res => {
            this.cancellingId = null;
            if (res.ok) {
              this.$Notice.success({ title: this.$t('intafaced.trade.cancelled'), desc: order.symbol });
              this.loadAccount();
              return;
            }
            this.$Notice.error({
              title: this.$t('intafaced.trade.cancelFailed'),
              desc: ixTrade.orderFailureMessage(res, 'cancel')
            });
          });
        }
      });
    },

    /**
     * THE WATCHLIST IS LOCAL TO THIS BROWSER, and the rail says so.
     *
     * The vendor stored favourites server-side via `/exchange/favor/*`. Our
     * surface is a CCXT contract and has no favourites endpoint. localStorage
     * is honest here because a watchlist is a display preference, not money or
     * account state — losing it on another device costs nothing and misleads
     * nobody. A star that silently un-set itself on reload would.
     */
    favoritesKey() {
      return 'ix.watchlist.v1';
    },
    loadFavorites() {
      try {
        const raw = window.localStorage.getItem(this.favoritesKey());
        const list = raw ? JSON.parse(raw) : [];
        this.localFavorites = Array.isArray(list) ? list.filter(s => typeof s === 'string') : [];
      } catch (e) {
        this.localFavorites = [];
      }
    },
    saveFavorites() {
      try {
        window.localStorage.setItem(this.favoritesKey(), JSON.stringify(this.localFavorites));
      } catch (e) {
        /* private mode / quota — a watchlist is not worth an error toast */
      }
    },
    setFavorite(symbol, next) {
      const at = this.localFavorites.indexOf(symbol);
      if (next && at < 0) this.localFavorites.push(symbol);
      if (!next && at >= 0) this.localFavorites.splice(at, 1);
      this.saveFavorites();
      const row = this.marketMap[symbol];
      if (row) row.isFavor = next;
      if (symbol === this.currentCoin.symbol) this.currentCoinIsFavor = next;
      this.markets = this.markets.slice();
    },
    toggleFavorite() {
      this.setFavorite(this.currentCoin.symbol, !this.currentCoinIsFavor);
    },
    toggleRowFavorite(row) {
      this.setFavorite(row.symbol, !row.isFavor);
    },

    warn(message) {
      this.$Message.warning(message);
    },

    /* ── formatting ────────────────────────────────────────────────────── */

    /**
     * The float escape hatch, and the only one on this page.
     *
     * `ixMoney.toFloat` is the named lossy conversion — for comparison, ordering
     * and the pixel arithmetic behind the depth estimate. It answers null for an
     * unreadable value; 0 is kept here as the fallback because every remaining
     * caller is a `> 0` guard that must stay false, not because 0 is a price.
     * Nothing this returns may be rendered as money or reach the wire: the money
     * path below goes through bookPriceForForm / percentSize / toFixedString.
     */
    num(value) {
      const n = ixMoney.toFloat(value);
      return n === null ? 0 : n;
    },

    /**
     * A decimal string, printed verbatim.
     *
     * Use this for every money figure that came off the wire. `fmt()` below
     * parses to a float and calls toFixed, which is fine for a derived display
     * number but wrong for a value the ledger produced — it silently rounds at
     * the seventeenth significant digit and it turns a null into a dash only by
     * accident. Null here is explicit and means unknown.
     */
    dec(value) {
      if (value === null || value === undefined || value === '') return '—';
      return String(value);
    },

    /**
     * A money figure at a fixed number of places — TRUNCATED, never rounded.
     *
     * This used to be `parseFloat(value).toFixed(scale)`, which rounds: a venue
     * quote of 1.45 printed at one place became 1.5, a price the venue never
     * made. The ladder is not only read — clicking a row copies the printed
     * price into the order form, so a rounded display was one click from an
     * order at an invented price. Unreadable stays a dash, never "0.00".
     */
    fmt(value, scale) {
      /* No published scale → absence, not an invented two-decimal format. */
      if (scale == null) return '—';
      const text = ixMoney.toFixedString(value, scale);
      return text === null ? '—' : text;
    },

    /** A decimal RATE ("0.001") as a percent label. A label, never a charge. */
    pctOf(rate, places) {
      const text = ixMoney.multiply(rate, '100', places == null ? 2 : places);
      return text === null ? '—' : text;
    },

    /* Market headline numbers: if the feed is down and the value is zero/empty,
       show a dash so "0.000000" cannot be read as a real print. */
    marketNum(value, scale) {
      if (value === null || value === undefined || value === '') {
        return '—';
      }
      if (typeof value === 'string' && value.trim() !== '' && ixMoney.toBN(value) === null) {
        return this.feedLive ? value : (value || '—');
      }
      if (ixMoney.toBN(value) === null) {
        return '—';
      }
      if (!this.feedLive && !ixMoney.isPositive(value) && ixMoney.compare(value, '0') === 0) {
        return '—';
      }
      return this.fmt(value, scale);
    },

    marketStat(value) {
      if (value == null || value === '' || value === '—') {
        return '—';
      }
      if (!this.feedLive && (value === '0' || value === '0%' || value === '+0%' || value === '-0%')) {
        return '—';
      }
      return value;
    },

    /* Display helper: never paint 0.000000 as a real print. Ladder rows are
       not padded — invalid levels are dropped in applyPlate (A-UI-2). */
    zero(value, scale) {
      /* null = unreadable, 0 = a real zero. Both are a dash: neither is a print. */
      const c = ixMoney.compare(value, '0');
      return c === null || c === 0 ? '—' : this.fmt(value, scale);
    },

    /** Tape/turnover display product — decimal strings only, never float *. */
    turnoverOf(row) {
      if (!row) return null;
      if (row.turnover != null && row.turnover !== '') return row.turnover;
      return ixMoney.multiply(row.price, row.amount);
    },

    /**
     * Truncate toward zero at `scale` places. Empty string for anything that is
     * not a readable positive value — the callers put this straight into an
     * input, and "" is an empty box while "0.00" is a size the user did not ask
     * for. Float `Math.floor(n * 10**scale)` is gone: at eight places the
     * multiply itself lands below the integer and drops a whole unit.
     */
    floor(value, scale) {
      if (!ixMoney.isPositive(value)) {
        return '';
      }
      const text = ixMoney.toFixedString(value, scale);
      return text === null ? '' : text;
    },

    clamp(value, scale) {
      let text = String(value == null ? '' : value).replace(/[^\d.]/g, '');
      const first = text.indexOf('.');
      if (first > -1) {
        text = text.slice(0, first + 1) + text.slice(first + 1).replace(/\./g, '');
        /* Without a published scale, do not invent a digit cap. */
        if (typeof scale === 'number' && isFinite(scale) && scale >= 0) {
          text = text.slice(0, first + 1 + scale);
        }
      }
      return text;
    },

    /* A CSS length, and the one place a float is legitimate — no user reads a
       bar width as a quantity. `ratio` scales in decimal first so the lossy
       division is the last operation rather than the first. */
    barWidth(row, side) {
      const total = side === 'bid' ? this.plate.bidTotal : this.plate.askTotal;
      return (ixMoney.ratio(row.totalAmount, total) * 100).toFixed(2) + '%';
    },

    roseClass(rose) {
      if (!rose) {
        return '';
      }
      const n = ixMoney.toFloat(rose);
      if (n === null || n === 0) return '';
      return n < 0 ? 'ix-down' : 'ix-up';
    },

    /* A market order has no price. Its `price` is null on the wire, and
       formatting null through fmt() would print a number. */
    priceLabel(row) {
      return row.type === 'MARKET_PRICE' ? 'Market' : this.dec(row.price);
    },

    /* Wave B9 — partial fill + id tools from data already on the blotter.
       Both figures are printed as the decimal strings the venue sent. */
    fillLabel(row) {
      if (row.tradedAmount === null || row.tradedAmount === undefined) return '—';
      return this.dec(row.tradedAmount) + ' / ' + this.dec(row.amount);
    },
    fillTitle(row) {
      const filled = this.num(row.tradedAmount);
      const total = this.num(row.amount);
      if (total <= 0) return '';
      const pct = ((filled / total) * 100).toFixed(1);
      return pct + '% filled';
    },
    copyOrderId(row) {
      const id = row && row.orderId != null ? String(row.orderId) : '';
      if (!id) {
        this.$Notice.warning({ title: this.$t('exchange.residual.noOrderId'), desc: this.$t('exchange.residual.noOrderIdDesc') });
        return;
      }
      const done = () => {
        this.$Notice.success({ title: this.$t('exchange.residual.copied'), desc: this.$t('exchange.residual.orderIdClipboard') });
        this.liveAnnounce = 'Order id copied';
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(id).then(done).catch(() => {
          this.fallbackCopy(id) && done();
        });
      } else if (this.fallbackCopy(id)) {
        done();
      }
    },
    fallbackCopy(text) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e) {
        return false;
      }
    },
    exportOpenOrdersCsv() {
      if (!this.openOrders.length) return;
      const esc = v => {
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const lines = [
        ['time', 'symbol', 'type', 'side', 'price', 'amount', 'filled', 'turnover', 'orderId'].join(',')
      ];
      this.openOrders.forEach(row => {
        lines.push(
          [
            esc(this.date(row.time)),
            esc(row.symbol),
            esc(row.type === 'MARKET_PRICE' ? $t('exchange.terminal.typeMarket') : $t('exchange.terminal.typeLimit')),
            esc(row.direction),
            esc(row.type === 'MARKET_PRICE' ? 'Market' : row.price),
            esc(row.amount),
            esc(row.tradedAmount),
            esc(row.turnover),
            esc(row.orderId)
          ].join(',')
        );
      });
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'open-orders.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    statusLabel(rowOrStatus) {
      const row = rowOrStatus && typeof rowOrStatus === 'object' ? rowOrStatus : null;
      const status = row ? row.status : rowOrStatus;
      if (status === 'COMPLETED') return 'Filled';
      if (status === 'CANCELED') return 'Cancelled';
      /* Partial: venue said TRADING/open history with fills < size — never invent %. */
      if (row && this.isPartialFill(row)) return 'Partial';
      if (status === 'TRADING') return 'Open';
      return status || '—';
    },

    statusClass(rowOrStatus) {
      const row = rowOrStatus && typeof rowOrStatus === 'object' ? rowOrStatus : null;
      const status = row ? row.status : rowOrStatus;
      if (status === 'COMPLETED') return 'ix-accent';
      if (status === 'CANCELED') return 'ix-dim';
      if (row && this.isPartialFill(row)) return 'ix-partial';
      return '';
    },

    isPartialFill(row) {
      if (!row) return false;
      const filled = this.num(row.tradedAmount);
      const total = this.num(row.amount);
      return total > 0 && filled > 0 && filled < total;
    },

    exportHistoryOrdersCsv() {
      if (!this.historyOrders.length) return;
      const esc = v => {
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const lines = [
        ['time', 'symbol', 'type', 'side', 'price', 'amount', 'filled', 'turnover', 'status', 'orderId'].join(',')
      ];
      this.historyOrders.forEach(row => {
        lines.push(
          [
            esc(this.date(row.time)),
            esc(row.symbol),
            esc(row.type === 'MARKET_PRICE' ? $t('exchange.terminal.typeMarket') : $t('exchange.terminal.typeLimit')),
            esc(row.direction),
            esc(row.type === 'MARKET_PRICE' ? 'Market' : row.price),
            esc(row.amount),
            esc(row.tradedAmount),
            esc(row.turnover),
            esc(this.statusLabel(row)),
            esc(row.orderId)
          ].join(',')
        );
      });
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'order-history.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.liveAnnounce = 'Order history CSV downloaded';
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
  /* B2 density: fill the viewport under the global nav; columns share one height. */
  --nav-chrome: 56px;
  --desk-pad: 16px;
  --head-h: 64px;
  --desk-h: calc(100vh - var(--nav-chrome) - var(--desk-pad));
  --col-h: calc(var(--desk-h) - var(--head-h) - 8px);
  min-height: var(--desk-h);
  box-sizing: border-box;
  padding: 8px;
  color: $text;
  font-size: 12px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}

/* ── shared surface ─────────────────────────────────────────────────────
   B1: solid P21 panels on the desk — no default glass blur (anti-slop). */
.ix-panel {
  position: relative; /* B5 resizer anchors */
  background: var(--ix-panel, #12151c);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
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
  background: var(--ix-panel, #12151c);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
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

/* A-UI-SUB — sits before live status; margin-left:auto on status still pins right. */
.ix-head-sub {
  margin-left: auto;
  flex: 0 1 auto;
  min-width: 0;
}

.ix-head-status {
  margin-left: 0;
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

/* ── layout ─────────────────────────────────────────────────────────────
   Density (design bar §3.2): fixed four-column terminal — markets | centre |
   book rail | order form — shared gap token so panels read as one product. */
.ix-body {
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr) 252px 296px;
  gap: var(--space-2, 8px);
  align-items: stretch;
  height: var(--col-h);
  min-height: 520px;
}

/* B5 — column splitters (desktop only; hidden under 1500px with markets). */
.ix-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  z-index: 6;
  cursor: col-resize;
  touch-action: none;
  background: transparent;
}
.ix-resizer:hover,
.ix-resizer:focus-visible {
  background: rgba(255, 107, 0, 0.22);
}
.ix-resizer-e {
  right: 0;
}
.ix-resizer-w {
  left: 0;
}
@media (max-width: 1499px) {
  .ix-resizer {
    display: none;
  }
}
/* Global during drag — avoid text selection while resizing. */
body.ix-resizing-cols {
  cursor: col-resize !important;
  user-select: none !important;
}

.ix-centre {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  min-width: 0;
  height: 100%;
  min-height: 0;
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
  height: 100%;
  min-height: 0;
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

/* Honesty recipes — loading / empty / error stay visually distinct (§3.1). */
.ix-empty {
  padding: 22px 12px;
  text-align: center;
  color: $faint;
  font-size: var(--type-11, 11px);
}
.ix-dualbook {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 107, 0, 0.35);
  border-radius: 6px;
  background: rgba(255, 107, 0, 0.06);
  color: #c8cdd4;
  font-size: 12.5px;
  line-height: 1.5;
}
.ix-dualbook strong {
  color: #ff6b00;
  font-weight: 600;
}
.ix-empty-error {
  color: $down;
  border-left: 2px solid $down;
  text-align: left;
  padding-left: var(--space-3, 12px);
}
.ix-empty-loading {
  font-style: italic;
  color: $dim;
}
.ix-empty-note {
  padding: 8px 12px 0;
  text-align: left;
  color: $faint;
  font-size: 10px;
  line-height: 1.35;
}
.ix-empty-abs {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  pointer-events: none;
  z-index: 2;
}
/* Chart empty: high-contrast line over the kline host (not $faint on black). */
.ix-empty-chart {
  margin: 0 auto;
  max-width: 28rem;
  padding: 10px 14px;
  border: 1px solid rgba(200, 205, 212, 0.28);
  border-radius: 4px;
  background: rgba(12, 14, 18, 0.92);
  color: #c8cdd4;
  font-size: var(--type-12, 12px);
  line-height: 1.4;
  text-align: center;
}

/* ── chart ────────────────────────────────────────────────────────────── */
.ix-chart-panel {
  flex: 1 1 auto;
  height: auto;
  min-height: 280px;
}
.ix-chart-body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

/* The widget writes an iframe in here. With `fullscreen` off and `autosize`
   on it inherits 100% of this box, which is why the box must be definite. */

.ix-chart-attr {
  position: relative;
  z-index: 2;
  margin: 0;
  padding: 4px 10px 6px;
  font-size: 11px;
  line-height: 1.3;
  opacity: 0.55;
  text-align: right;
}
.ix-chart-attr a {
  color: inherit;
  text-decoration: underline;
}
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
  z-index: 0;
}
/* Dim the host when honesty empty is showing so the status line wins. */
.ix-kline.is-empty {
  opacity: 0.22;
  pointer-events: none;
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
  height: 100%;
  min-height: 0;
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

.ix-book-group {
  margin-left: 6px;
  background: transparent;
  color: inherit;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 3px;
  font-size: 11px;
  padding: 1px 4px;
  max-width: 64px;
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
  flex: 0 0 200px;
  height: 200px;
  min-height: 160px;
}
.ix-account-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* B14 — cheap virtualization assist for long blotters */
.ix-table tbody tr {
  content-visibility: auto;
  contain-intrinsic-size: 0 32px;
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
  height: 100%;
  min-height: 0;
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
/* Order type Limit|Market — one control group, not scattered (§3.2). */
.ix-type-tabs {
  margin: 0 var(--space-2, 8px);
  border: 1px solid $hair;
  border-radius: $radius-sm;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid $hair;
  button {
    flex: 1 1 0;
  }
}

.ix-order-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-3, 12px) var(--space-2, 10px);
}

.ix-field {
  margin-bottom: var(--space-3, 10px);
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
    height: var(--control-h, 34px);
    min-height: var(--control-h, 34px);
    padding: 0 52px 0 10px;
    font-size: var(--type-13, 13px);
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum' 1;
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
  height: var(--control-h, 34px);
  line-height: var(--control-h, 34px);
  font-size: var(--type-11, 11px);
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
  /* B9: disclosure sits under the fee row full-width. */
  > div.ix-fee-row {
    flex-wrap: wrap;
    align-items: flex-start;
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
.ix-fee-help {
  appearance: none;
  margin-left: 6px;
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: $faint;
  font-size: 10px;
  line-height: 14px;
  cursor: pointer;
  vertical-align: middle;
  &:hover,
  &[aria-expanded='true'] {
    color: $orange;
    border-color: rgba(255, 107, 0, 0.55);
  }
}
.ix-fee-disclosure {
  flex: 1 1 100%;
  margin: 6px 0 2px;
  padding: 8px 10px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.28);
  font-size: 11px;
  line-height: 1.4;
  color: $dim;
  strong {
    color: $text;
    font-weight: 600;
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
.ix-order-note.ix-order-error {
  color: #ff6b6b;
  font-weight: 500;
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
.ix-partial {
  color: var(--ix-orange-light, #ff8534);
  font-weight: 600;
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
  .ix-rail {
    height: auto;
    max-height: 420px;
  }
  /* B4 — sticky ticket + pair header; solid panels; panic controls reachable. */
  .ix-head {
    position: sticky;
    top: 0;
    z-index: 25;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 6px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  }
  .ix-order {
    height: auto;
    max-height: none;
    position: sticky;
    bottom: 0;
    z-index: 20;
    box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.45);
    background: var(--ix-panel, #12151c);
    /* Focus ring when ticket is active (mobile focus-trap affordance). */
    &:focus-within {
      outline: 1px solid rgba(255, 107, 0, 0.55);
      outline-offset: 0;
    }
  }
  .ix-order-body {
    overflow: visible;
    max-height: min(52vh, 420px);
    overflow-y: auto;
  }
  .ix-submit {
    min-height: 48px;
    font-size: 15px;
    position: sticky;
    bottom: 0;
    z-index: 2;
  }
  .ix-chart-panel {
    height: 280px;
  }
  .ix-account {
    max-height: 360px;
  }
  /* Panic cancel stays reachable on open-orders blotter */
  .ix-actions {
    position: sticky;
    right: 0;
    background: var(--ix-panel, #12151c);
  }
  .ix-cancel {
    min-height: 40px;
    min-width: 72px;
    padding: 0 12px;
  }
  .ix-kbd-hint {
    display: none;
  }
  .ix-stat {
    min-width: 72px;
  }
}

@media (max-width: 520px) {
  .ix-markets {
    display: none;
  }
  .ix-chart-panel {
    height: 240px;
  }
}
</style>

<!-- Unscoped: the chart host #ix_kline must keep a definite height;
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

.ix-kbd-hint {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.35;
  opacity: 0.72;
}
.ix-kbd-hint kbd {
  display: inline-block;
  padding: 0 5px;
  border: 1px solid var(--ix-hairline, #242a34);
  border-radius: 4px;
  font-size: 10px;
  font-family: inherit;
  color: var(--ix-text-dim, #8a909c);
  background: var(--ix-surface-raised, #161a22);
}
.ix-blotter-tools {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 0 0 8px;
}
.ix-linkish {
  background: transparent;
  border: 0;
  color: var(--ix-orange, #ff6b00);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 0 4px;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.ix-linkish:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  text-decoration: none;
}
.ix-actions {
  white-space: nowrap;
}
.ix-actions .ix-cancel {
  margin-left: 8px;
}
/* B6 watchlist rail */
.ix-watch-rail {
  border-bottom: 1px solid var(--ix-hairline, #242a34);
  margin-bottom: 6px;
  padding-bottom: 6px;
}
.ix-watch-rail-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 8px 4px;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ix-text-dim, #8a909c);
}
.ix-market-row-watch {
  background: rgba(255, 107, 0, 0.04);
}
/* B10 screen-reader only */
.ix-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
/* B2 density — pair head + stats tighter */
.ix-terminal .ix-head {
  min-height: 44px;
}
.ix-terminal .ix-stat dt {
  font-size: 10px;
}
.ix-terminal .ix-stat dd {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.ix-terminal .ix-order .ix-meta {
  font-size: 12px;
}
.ix-order-note.ix-order-error:focus {
  outline: 1px solid var(--ix-orange, #ff6b00);
  outline-offset: 2px;
}
/* A-UI-A11Y — local fallback if intafaced.css load order lags */
.ix-terminal .ix-error-summary {
  margin-bottom: 10px;
}
.ix-terminal .ix-error-summary:focus {
  outline: 2px solid var(--ix-orange, #ff6b00);
  outline-offset: 2px;
}
</style>

