<template>
  <div class="home-showcase">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="home-hero-copy">
        <p class="home-eyebrow">THE INTAFACED FINANCIAL OS</p>
        <h1 id="home-title">Your money.<br>Your markets.<br>One interface.</h1>
        <p class="home-intro">A focused workspace for trading, money and payments. Move between the details and the bigger picture.</p>
        <div class="home-hero-actions">
          <router-link class="home-primary" to="/exchange/btc_usdt">Explore the desk <span aria-hidden="true">↗</span></router-link>
          <router-link class="home-secondary" to="/platform">Open platform <span aria-hidden="true">→</span></router-link>
        </div>
        <p class="home-preview-note">Product preview. Explore the interface; availability is shown in each workspace.</p>
      </div>
      <nav class="home-workspaces" aria-label="Explore the workspaces">
        <div class="home-workspaces-caption"><span>THE WORKSPACE</span><span>01 — 04</span></div>
        <router-link to="/exchange/btc_usdt" class="home-workspace">
          <span class="home-workspace-index">01</span><div><h2>Exchange</h2><p>The market, in detail.</p><span>Chart · order book · execution</span></div><b aria-hidden="true">↗</b>
        </router-link>
        <router-link to="/uc/money" class="home-workspace">
          <span class="home-workspace-index">02</span><div><h2>Money</h2><p>Your ledger, clearly.</p><span>Balances · account activity</span></div><b aria-hidden="true">↗</b>
        </router-link>
        <router-link to="/bank" class="home-workspace">
          <span class="home-workspace-index">03</span><div><h2>Bank</h2><p>A place for every purpose.</p><span>Spaces · transfers · business</span></div><b aria-hidden="true">↗</b>
        </router-link>
        <router-link to="/pay" class="home-workspace">
          <span class="home-workspace-index">04</span><div><h2>Pay</h2><p>The merchant workspace.</p><span>Payment links · settlements</span></div><b aria-hidden="true">↗</b>
        </router-link>
      </nav>
    </section>
    <section class="home-platform" aria-labelledby="home-platform-title">
      <p class="home-section-label">CONNECTED BY DESIGN</p>
      <div><h2 id="home-platform-title">One identity.<br>A wider world.</h2></div>
      <div class="home-platform-copy"><p>Your platform session connects the workspaces. Explore the full directory, from peer-to-peer markets to the academy.</p><router-link to="/platform">Discover the platform <span aria-hidden="true">→</span></router-link></div>
    </section>
      <section class="home-market" id="page2" v-if="!loading && !marketsDown && Object.keys(coins._map).length">
        <div class="home-section-label">Market snapshot</div>
        <div class="page2nav">
          <div class="board-title" style="display:inline-block;display: none;">{{$t('sectionPage.mainboard')}} &nbsp; >>></div>
          <ul class="brclearfix">
            <li v-show="!(index==0&&!isLogin)" v-for="(item,index) in indexBtn" @click="addClass(index)" :class="{'active' :index==choseBtn,'ivu-btn-default':index!=choseBtn}" :key="index">{{item.text}}</li>
            <li style="float:right;padding-right: 6px;"><Input :placeholder="$t('common.searchplaceholder')" :aria-label="$t('common.searchplaceholder')" @on-change="seachInputChange" v-model="searchKey"/></li>
          </ul>
        </div>
        <div class="ptjy">
          <!-- Provenance, and the refusal to call this feed live. The table is
               one REST read taken on load: startWebsock is gone and this shell
               has no websocket. Where every listed market is untraded, the
               table of "Not traded" cells gets the one sentence that explains
               why, so it reads as a venue that has not printed rather than a
               page that failed to load. -->
          <p class="ix-provenance" v-if="!loading && !marketsDown">
            {{ $t('intafaced.trade.snapshotSource') }}
            <span v-if="noneTradedYet"> · {{ $t('intafaced.trade.noneTraded') }}</span>
          </p>
          <Table v-if="choseBtn==0" :columns="favorColumns" :data="dataIndex" class="tables" :disabled-hover="true" :loading="loading" :no-data-text="marketsTableEmptyText"></Table>
          <Table v-if="choseBtn!=0" :columns="coins.columns" :data="dataIndex" class="tables" :disabled-hover="true" :loading="loading" :no-data-text="marketsTableEmptyText"></Table>
<!--
          <p v-if="choseBtn!=0" style="height:50px;line-height:50px;padding-left:10px;border-bottom:1px solid #222222;font-size:14px;color:rgb(97, 119, 146);">Launchpad</p>
          <Table v-if="choseBtn!=0" :columns="coins.columns" :data="dataIndex2" class="tables" :disabled-hover="true" :loading="loading" :no-data-text="$t('common.nodata')"></Table>
-->
        </div>
      </section>

    <section class="home-access" aria-labelledby="home-access-title">
      <div><p class="home-section-label">WHAT COMES NEXT</p><h2 id="home-access-title">Stay in the loop.</h2><p>Register your interest in the next release.</p></div>
      <details class="home-access-details"><summary>Join the waitlist <span aria-hidden="true">+</span></summary><div class="home-access-forms">
        <div class="ix-waitlist-card">
          <h2>{{ $t('intafaced.waitlist.title') }}</h2>
          <p>{{ $t('intafaced.waitlist.lead') }}</p>
          <form @submit.prevent="enrollWaitlist">
            <input v-model.trim="waitlistEmail" type="email" required :placeholder="$t('intafaced.waitlist.email')" :aria-label="$t('intafaced.waitlist.email')">
            <input v-model.trim="waitlistReferralCode" :placeholder="$t('intafaced.waitlist.referralCode')" :aria-label="$t('intafaced.waitlist.referralCode')">
            <button type="submit">{{ $t('intafaced.waitlist.enroll') }}</button>
          </form>
          <p v-if="waitlistDropUnbuilt" class="ix-waitlist-unbuilt" role="alert">{{ $t('intafaced.drop.unbuilt') }}</p>
          <IxState compact
            :loading="waitlistAction.busy"
            :reason="waitlistAction.ran ? waitlistAction.reason : null"
            :message="waitlistAction.message"
            endpoint="/api/identity/trpc/waitlist.enroll"
          >
            <p v-if="waitlistResult" class="ix-waitlist-result">
              {{ $t('intafaced.waitlist.position') }}: <code>{{ waitlistResult.position }}</code> ·
              {{ $t('intafaced.waitlist.referralCode') }}: <code>{{ waitlistResult.referralCode }}</code>
            </p>
          </IxState>
          <div class="ix-waitlist-position">
            <input v-model.trim="waitlistLookupCode" :placeholder="$t('intafaced.waitlist.lookupCode')" :aria-label="$t('intafaced.waitlist.lookupCode')">
            <button type="button" @click="lookupWaitlistPosition">{{ $t('intafaced.waitlist.lookup') }}</button>
            <IxState compact
              :loading="waitlistPosition.loading"
              :reason="waitlistPosition.reason"
              :message="waitlistPosition.message"
              endpoint="/api/identity/trpc/waitlist.position"
            >
              <span v-if="waitlistPosition.data">{{ $t('intafaced.waitlist.position') }}: <code>{{ waitlistPosition.data.position }}</code></span>
            </IxState>
          </div>
        </div>
        <div v-if="isLogin" class="ix-waitlist-card">
          <h2>{{ $t('intafaced.kyc.submitTitle') }}</h2>
          <p>{{ $t('intafaced.kyc.submitLead') }}</p>
          <form @submit.prevent="submitKyc">
            <select v-model="kycTier" required :aria-label="$t('intafaced.kyc.tier')">
              <option value="basic">{{ $t('intafaced.kyc.tierBasic') }}</option>
              <option value="full">{{ $t('intafaced.kyc.tierFull') }}</option>
              <option value="institutional">{{ $t('intafaced.kyc.tierInstitutional') }}</option>
            </select>
            <input
              v-model.trim="kycJurisdiction"
              maxlength="2"
              required
              :placeholder="$t('intafaced.kyc.jurisdictionHint')"
              :aria-label="$t('intafaced.kyc.jurisdiction')"
            >
            <button type="submit">{{ $t('intafaced.kyc.submit') }}</button>
          </form>
          <IxState compact
            :loading="kycAction.busy"
            :reason="kycAction.ran ? kycAction.reason : null"
            :message="kycAction.message"
            endpoint="/api/identity/trpc/kyc.submit"
          >
          </IxState>
          <div class="ix-waitlist-position">
            <IxState compact
              :loading="kycStatus.loading"
              :reason="kycStatus.reason"
              :message="kycStatus.message"
              endpoint="/api/identity/trpc/kyc.status"
            >
              <span v-if="kycPendingRows.length">
                <span v-for="r in kycPendingRows" :key="'status-' + r.id">
                  {{ $t('intafaced.kyc.submitPending') }}:
                  <code>{{ r.tier }}</code> ·
                  <code>{{ r.jurisdiction }}</code> ·
                  <code>{{ r.status }}</code>
                </span>
              </span>
            </IxState>
          </div>
        </div>

      </div></details>
    </section>
  </div>
</template>
<script>
/**
 * THE MARKET LIST — `GET /api/v1/markets` + `GET /api/v1/tickers` on svc-trade
 * through svc-edge. Was `POST /market/symbol-thumb-trend` plus a SockJS/STOMP
 * feed on the retired Java market service (ADR 2026-08-02, Option B).
 *
 * WHAT A READER SEES TODAY, AND WHY IT IS NOT A BUG. Our ticker reports `null`
 * for every 24h rollup — high, low, volume, change — because no windowed
 * aggregation job exists, and `null` for last price on a market that has never
 * traded. Last price prints `intafaced.trade.notTraded` (not the string
 * "null", not a green up-arrow). Change / high / low / volume print an
 * em-dash. PRICE TREND is gone — no candle series, so no sparkline of zeros.
 * Provenance: `intafaced.trade.snapshotSource`. When every listed market is
 * untraded, `intafaced.trade.noneTraded` sits above the table.
 *
 * The table is a snapshot taken on load and does not tick; the live feed is a
 * separate service and is not wired here. See the note where startWebsock was.
 */
var moment = require("moment");
var fixedDecimal = require("../../assets/js/fixed-decimal.js");
import { rest, query, mutate } from "@/config/intafaced.js";
import ixTrade from "@js/ix-trade.js";
import $ from "@js/jquery.min.js";
import IxState from "../../components/intafaced/IxState.vue";
import ixModule from "../../components/intafaced/module-mixin.js";


/* A figure the venue did not publish prints an em dash — the same mark the
   desk uses (Exchange.vue marketNum/marketStat). Never a blank cell, which
   reads as a value that failed to load, and never the string "null". */
function isAbsent(value) {
  return value === null || value === undefined || value === "" || value === "null";
}
function dash(value) {
  return isAbsent(value) ? "—" : String(value);
}

function decimalText(value) {
  if (typeof value !== "string") return null;
  var text = value.trim();
  if (text.charAt(text.length - 1) === "%") text = text.slice(0, -1).trim();
  return fixedDecimal.parse(text) ? text : null;
}

function decimalSign(value) {
  var text = decimalText(value);
  return text === null ? null : fixedDecimal.compareStrings(text, "0");
}

function sortDecimals(a, b, type) {
  var left = decimalText(a);
  var right = decimalText(b);
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  var comparison = fixedDecimal.compareStrings(left, right);
  return type === "asc" ? comparison : -comparison;
}

/**
 * Waitlist / referral drop refuse — FlagDisabledError on the wire is
 * `flag.waitlist.enabled.*` / `flag.referral.queue.*` / `waitlist.unbuilt`.
 * Named unbuilt, not a silent queue.
 */
function isDropFlagRefuse(message) {
  if (!message) return false;
  return (
    message.indexOf("flag.waitlist.enabled") !== -1 ||
    message.indexOf("flag.referral.queue") !== -1 ||
    message.indexOf("waitlist.unbuilt") !== -1 ||
    message.indexOf("FlagDisabledError") !== -1
  );
}

function nameDropUnbuilt(self, message) {
  return self.$t("intafaced.drop.unbuilt") + " " + message;
}

/**
 * THE PRICE CELL, AND THE ARROW THAT USED TO POINT UP ON EVERYTHING.
 *
 * `close` is null on a market that has never traded. The vendor's two copies
 * of this cell rendered that null straight out: the favourites table drew a
 * blank, the coins table drew the literal string "null" (it appended `+ ""`).
 * Both read as a price that failed to load rather than a market with no price,
 * so an untraded market now says so in words (`intafaced.trade.notTraded`).
 *
 * The arrow is now bound to a real move. It was `rose < 0 ? down : up`, and
 * `rose` is null on every market this venue lists — the old numeric coercion
 * treated that as non-negative, so every single row printed a green up-arrow.
 * That is sixteen markets
 * claiming a rise on a platform that publishes no 24h window to compute one
 * from. No move, no arrow. A flat 0% gets no arrow either.
 *
 * PRICE TREND is deleted (both column sets). It read `row.trend.length` while
 * ix-trade never emits `trend`, then fell back to a 25-zero sparkline — a fake
 * history for markets that have never printed. No series, no column.
 */
function renderPriceCell(h, self, row) {
  var price = !isAbsent(row.price) ? row.price : row.close;
  if (isAbsent(price)) {
    return h("div", { attrs: { class: "price-td" } }, [
      h("span", { attrs: { class: "ix-muted" } }, self.$t("intafaced.trade.notTraded"))
    ]);
  }
  var move = decimalSign(row.rose);
  var children = [h("span", {}, String(price))];
  if (move !== null && move !== 0) {
    children.push(
      h("Icon", {
        props: { type: move < 0 ? "arrow-down-c" : "arrow-up-c" },
        style: { fontSize: "16px", marginLeft: "5px", verticalAlign: "middle" },
        class: { red: move < 0, green: move > 0 }
      })
    );
  }
  return h("div", { attrs: { class: "price-td" } }, children);
}

/* The 24h change column, null on every market — and not for the same reason
   the price is. No windowed rollup exists to compute a move over, which the
   hover says in full. Colour follows the sign of a real move only. */
function renderChangeCell(h, self, row) {
  var move = decimalSign(row.rose);
  if (isAbsent(row.rose) || move === null) {
    return h(
      "span",
      {
        attrs: {
          class: "ix-muted",
          title: self.$t("intafaced.trade.noChangeWindow")
        }
      },
      "—"
    );
  }
  var className = move < 0 ? "red" : move > 0 ? "green" : "ix-muted";
  return h("span", { attrs: { class: className } }, row.rose);
}

export default {
  components: { IxState },
  mixins: [ixModule],
  data() {
    let self = this;
    return {
      loading: false,
      /* True only when market thumb failed — empty table is not "no markets". */
      marketsDown: false,
      percent: 0,
      yesDayCashDividensBonusETH: 0,
      dataIndex: [],
      searchKey: "",
      favorColumns: [
        {
          title: self.$t("service.favor"),
          align: "center",
          key: "collection",
          width: 60,
          render: (h, params) => {
            let flag = this.isLogin;
            return h("Icon", {
              props: {
                color: "#c8c8c8",
                size: "18",
                type: params.row.isFavor
? "ios-star"
: "ios-star-outline"
              },
              nativeOn: {
                click: () => {
                  if (this.isLogin) {
                    event.stopPropagation(); //stop event propagation
                    if (
                      event.currentTarget.className ==
                      "ivu-icon ivu-icon-ios-star"
) {
                      this.cancelCollect(params.index, params.row);
                      event.currentTarget.className ==
                        "ivu-icon ivu-icon-ios-star-outline";
                    } else {
                      this.collect(params.index, params.row);
                      event.currentTarget.className =
                        "ivu-icon ivu-icon-ios-star";
                    }
                  } else {
                    this.$Message.warning(this.$t('common.loginfirst'));
                  }
                }
              }
            });
          }
        },
        {
          title: self.$t("service.COIN"),
          align: "center",
          width: 70,
          key: "symbol"
        },
        {
          title: self.$t("service.NewPrice"),
          align: "center",
          key: "price",
          minWidth:180,
          sortable: true,
          sortMethod: function(a, b, type) {
            return sortDecimals(a, b, type);
          },
          render: function(h, params) {
            // The "≈ ¥nnn" secondary price is gone. It multiplied the row by
            // `self.CNYRate || 6.5`, and CNYRate starts null and is only set by
            // an endpoint with no error branch — so whenever that call failed,
            // every row printed a CNY price computed at an invented 6.5 rate
            // and rendered it in the same cell as the real one. A reader had no
            // way to tell the two apart. Doctrine: never invent a number.
            return renderPriceCell(h, self, params.row);
          }
        },
        {
          title: self.$t("service.Change"),
          align: "center",
          key: "rose",
          minWidth:50,
          sortable: true,
          sortMethod: function(a, b, type) {
            return sortDecimals(a, b, type);
          },
          render: (h, params) => {
            return renderChangeCell(h, self, params.row);
          }
        },
        {
          title: self.$t("service.high"),
          align: "center",
          key: "high",
          render: (h, params) => {
            return h("div", {}, dash(params.row.high));
          }
        },
        {
          title: self.$t("service.low"),
          align: "center",
          key: "low",
          render: (h, params) => {
            return h("div", {}, dash(params.row.low));
          }
        },
        {
          title: self.$t("service.ExchangeNum"),
          align: "center",
          key: "volume",
          // width: 110,
          sortable: true,
          sortMethod: function(a, b, type) {
            return sortDecimals(a, b, type);
          },
          render: (h, params) => {
            return h("div", {}, dash(params.row.volume));
          }
        },
        /* REMOVED: the PRICE TREND sparkline, from both column sets.

           It read `params.row.trend`, a field the vendor's dead
           `/market/symbol-thumb-trend` used to send and that nothing on this
           platform produces — `toMarketRow` has no `trend` key, so the column
           threw on every row it drew. Its own fallback is why it could not
           simply be repointed: twenty-five literal zeros, fed to SvgLine and
           coloured green because `rose` is null, drew a flat green line under
           every market. That is a price history, and we do not have one. A
           trend needs candles, candles are aggregated from real fills, and no
           market here has traded.

           Not replaced by an empty cell either. A column head reading PRICE
           TREND above sixteen blanks still promises a series that does not
           exist. When candles are real, the column comes back with them. */
        {
            title: self.$t("service.Operate"),
            align: "center",
            key: "buyBtn",
            width: 100,
            render: function(h, params) {
              return h("div", [
                h("span", {
                  style: {
                    cursor: "pointer",
                    color: "#c8c8c8",
                    display: "inline-block",
                    padding: "2px 8px"
                  },
                  on: {
                    click: function() {
                      self.$router.push({
                        name: 'ExchangePair',
                        params: {
                          pair: params.row.href
                        }
                      });
                    }
                  }
                }, self.$t("service.trading"))
              ]);
            }
          }
      ],
      // , Pair
      coins: {
        _map: [],
        USDT: [],
        USDT2: [],
        BTC: [],
        BTC2: [],
        ETH: [],
        ETH2: [],
        favor: [],
        columns: [
          {
            title: self.$t("service.favor"),
            align: "center",
            key: "collection",
            width: 60,
            // renderHeader: (h, params) => {
            // return h("Icon", {
            // props: {
            // color: "#c8c8c8",
            // size: "18",
            // type: "android-star-outline"
            // }
            // });
            // },
            render: (h, params) => {
              let flag = this.isLogin;
              return h("Icon", {
                props: {
                  color: "#c8c8c8",
                  size: "18",
                  type: params.row.isFavor
? "ios-star"
: "ios-star-outline"
                },
                nativeOn: {
                  click: (event) => {
                    if (this.isLogin) {
                      event.stopPropagation(); //stop event propagation
                      if (
                        event.currentTarget.className ==
                        "ivu-icon ivu-icon-ios-star"
) {
                        this.cancelCollect(params.index, params.row);
                        event.currentTarget.className ==
                          "ivu-icon ivu-icon-ios-star-outline";
                      } else {
                        this.collect(params.index, params.row);
                        event.currentTarget.className =
                          "ivu-icon ivu-icon-ios-star";
                      }
                    } else {
                      this.$Message.warning(this.$t('common.loginfirst'));
                    }
                  }
                }
              });
            }
          },
          {
            title: self.$t("service.COIN"),
            align: "center",
            key: "coin",
            width: 90,
            render: function(h, params) {
              return h("div", [
                h("span", {}, params.row.coin+"/"+params.row.base)
              ]);
            }
          },
          {
            title: self.$t("service.NewPrice"),
            align: "center",
            key: "price",
            minWidth: 150,
            sortable: true,
            sortMethod: function(a, b, type) {
              return sortDecimals(a, b, type);
            },
            render: function(h, params) {
              // Same removal as the favourites table above. This copy was worse:
              // it computed a guarded local `CNYRate` and then multiplied by the
              // unguarded `self.CNYRate`, so it printed NaN as often as it
              // printed a fabricated rate. It was also the copy that appended
              // `+ ""` to the price, which is what turned a null last price
              // into the literal word "null" in the cell.
              return renderPriceCell(h, self, params.row);
            }
          },
          {
            title: self.$t("service.Change"),
            align: "center",
            key: "rose",
            minWidth: 50,
            sortable: true,
            sortMethod: function(a, b, type) {
              return sortDecimals(a, b, type);
            },
            render: (h, params) => {
              return renderChangeCell(h, self, params.row);
            }
          },
          {
            title: self.$t("service.high"),
            align: "center",
            key: "high",
            render: (h, params) => {
              return h("div", {}, dash(params.row.high));
            }
          },
          {
            title: self.$t("service.low"),
            align: "center",
            key: "low",
            render: (h, params) => {
              return h("div", {}, dash(params.row.low));
            }
          },
          {
            title: self.$t("service.ExchangeNum"),
            align: "center",
            key: "volume",
            // minWidth: 110,
            sortable: true,
            sortMethod: function(a, b, type) {
              return sortDecimals(a, b, type);
            },
            render: (h, params) => {
              return h("div", {}, dash(params.row.volume));
            }
          },
          /* PRICE TREND removed here too — see the note in favorColumns. */
          {
            title: self.$t("service.Operate"),
            align: "center",
            key: "buyBtn",
            width: 100,
            render: function(h, params) {
              return h("div", [
                h("span", {
                  style: {
                    cursor: "pointer",
                    color: "#c8c8c8",
                    display: "inline-block",
                    padding: "2px 8px"
                  },
                  on: {
                    click: function() {
                      self.$router.push({
                        name: 'ExchangePair',
                        params: {
                          pair: params.row.href
                        }
                      });
                    }
                  }
                }, self.$t("service.trading"))
              ]);
            }
          }
        ]
      },
      /* Rebuilt from the real listing once /markets answers — see rebuildTabs.
         Starts with the watchlist alone rather than three hardcoded quote tabs,
         so nothing claims a USDT/BTC/ETH market exists before the venue says so. */
      indexBtn: [
        {
          text: this.$t("intafaced.trade.watchlistTab")
        }
      ],
      /** Quote assets the venue actually lists, in listing order. */
      quoteTabs: [],
      /** Watchlist symbols, local to this browser. Not account state. */
      localFavorites: [],
      /** Verbatim refusal text from the venue, when the listing could not load. */
      marketsMessage: "",
      choseBtn: 0,
      valueCal: 0,
      showArrow: "never",
      speed: 5000,
      symbol: "",
      usdtData: [],
      usdtList: [],
      btcList: [],
      ethList: [],
      waitlistEmail: "",
      waitlistReferralCode: "",
      waitlistLookupCode: "",
      waitlistAction: this.emptyAction(),
      waitlistPosition: { loading: false, reason: null, message: "", data: null },
      kycTier: "basic",
      kycJurisdiction: "",
      kycAction: this.emptyAction(),
      kycStatus: { loading: false, reason: null, message: "", data: null }
    };
  },
  created: function() {
    this.init();
  },
  computed: {
    waitlistResult: function() {
      return this.waitlistAction.data;
    },
    waitlistDropUnbuilt: function() {
      return isDropFlagRefuse(this.waitlistAction.message) || isDropFlagRefuse(this.waitlistPosition.message);
    },
    kycPendingRows: function() {
      var data = this.kycStatus.data;
      var records = data && data.records ? data.records : [];
      return records.filter(function (r) { return r.status === "pending"; });
    },
    isLogin: function() {
      return this.$store.getters.isLogin;
    },
    lang: function() {
      return this.$store.state.lang;
    },
    langPram: function(){
      if(false){
        return "CN";
      }
      if(this.$store.state.lang == "English"){
        return "EN";
      }
      return "CN";
    },
    marketsTableEmptyText: function() {
      if (this.marketsDown) {
        return this.$t("common.marketsUnavailable");
      }
      return this.$t("common.nodata");
    },
    /* True when the venue lists markets and not one of them has ever printed.
       Read across the whole listing, not the open tab — the sentence it gates
       is a claim about every listed market. */
    noneTradedYet: function() {
      if (this.loading || this.marketsDown) return false;
      var map = this.coins._map || {};
      var symbols = Object.keys(map);
      if (symbols.length === 0) return false;
      for (var i = 0; i < symbols.length; i++) {
        var row = map[symbols[i]];
        var price = !isAbsent(row.price) ? row.price : row.close;
        if (!isAbsent(price)) return false;
      }
      return true;
    }
  },
  watch: {
    lang: function() {
      this.updateLangData();
    }
  },
  mounted: function() {
    this.loadFavorites();
    this.getSymbol();
  },
  methods: {
    enrollWaitlist() {
      var self = this;
      var input = { email: this.waitlistEmail };
      if (this.waitlistReferralCode) input.referralCode = this.waitlistReferralCode;
      this.act("waitlistAction", mutate("identity", "waitlist.enroll", input, this.ixToken)).then(function (res) {
        if (!res.ok && isDropFlagRefuse(res.message)) {
          self.waitlistAction.reason = "no_surface";
          self.waitlistAction.message = nameDropUnbuilt(self, res.message);
        }
      });
    },
    lookupWaitlistPosition() {
      var self = this;
      if (!this.waitlistLookupCode) return;
      this.load("waitlistPosition", query("identity", "waitlist.position", { referralCode: this.waitlistLookupCode }, null)).then(function (res) {
        if (!res.ok && isDropFlagRefuse(res.message)) {
          self.waitlistPosition.reason = "no_surface";
          self.waitlistPosition.message = nameDropUnbuilt(self, res.message);
        }
      });
    },
    submitKyc() {
      var self = this;
      this.act("kycAction", mutate('identity', 'kyc.submit', { tier: this.kycTier, jurisdiction: this.kycJurisdiction.toUpperCase() }, this.ixToken)).then(function (res) {
        if (res.ok) {
          self.load("kycStatus", query('identity', 'kyc.status', undefined, self.ixToken));
        }
      });
    },
    seachInputChange(){
      this.searchKey = this.searchKey.toUpperCase();
      var source;
      if (this.choseBtn === 0) {
        source = this.coins.favor;
      } else {
        var quote = this.quoteTabs[this.choseBtn - 1];
        source = quote ? this.coins[quote] || [] : [];
      }
      var key = this.searchKey;
      this.dataIndex = key
        ? source.filter(function (item) { return item.symbol.indexOf(key) === 0; })
        : source;
    },
    /* REMOVED: initSwiper(). It bound the promo swiper that loadPicData() fed;
       with no slide source and no markup left, it had nothing to bind to and
       would have thrown on the missing `#swiper_container`. */
    strde(str) {
      str = str.trim();
      if(this.langPram == "EN"){
        return str.length > 25? str.slice(0, 25) + "...": str;
      }
      return str.length > 18? str.slice(0, 18) + "...": str;
    },
    updateLangData() {
      /* Quote-tab labels are asset codes and are not translated; only the
         watchlist tab has copy, so rebuildTabs() is the whole job here. */
      this.rebuildTabs();

      this.coins.columns[0].title = this.$t("service.favor");
      this.coins.columns[1].title = this.$t("service.COIN");
      this.coins.columns[2].title = this.$t("service.NewPrice");
      this.coins.columns[3].title = this.$t("service.Change");
      this.coins.columns[4].title = this.$t("service.high");
      this.coins.columns[5].title = this.$t("service.low");
      this.coins.columns[6].title = this.$t("service.ExchangeNum");
      this.coins.columns[7].title = this.$t("service.Operate");

      this.favorColumns[0].title = this.$t("service.favor");
      this.favorColumns[1].title = this.$t("service.COIN");
      this.favorColumns[2].title = this.$t("service.NewPrice");
      this.favorColumns[3].title = this.$t("service.Change");
      this.favorColumns[4].title = this.$t("service.high");
      this.favorColumns[5].title = this.$t("service.low");
      this.favorColumns[6].title = this.$t("service.ExchangeNum");
      this.favorColumns[7].title = this.$t("service.Operate");
    },
    init() {
      this.$store.commit("navigate", "nav-index");
      this.$store.state.HeaderActiveName = "1-1";
      this.addClass(1);
      // this.getmoneyData();
      /* Announcement strip: IxNoSurface cms.announcements (no /uc fetch/toast). */
    },
    getStyle(obj, attr) {
      if (obj.currentStyle) {
        return obj.currentStyle[attr];
      } else {
        return getComputedStyle(obj, false)[attr];
      }
    },
    /* REMOVED: getCNYRate(). It read `/market/exchange-rate/usd-cny` on the
       retired Java market service to convert prices into CNY. This platform
       publishes no FX rate source, so there is nothing to repoint it at — and a
       fiat conversion computed from a rate we invented is a price, not a
       decoration. `CNYRate` stays null and every place that used it already
       guards on it. */
    donwload(type) {
      const title = this.$t("common.tip");
      const content = "<p>" + this.$t("common.expect") + "</p>";
      this.$Modal.info({
        title: title,
        content: content,
        closable: true
      });
    },
    /* REMOVED: loadPicData(). It POSTed `/uc/ancillary/system/advertise` on the
       retired Java `uc` service to fetch homepage promo banners. That route now
       answers 405, and the call had no rejection handler — so every visit to the
       landing page raised an uncaught rejection before it had rendered anything.
       That is what this removal is actually for: the banners were already
       invisible (`picShow` never flipped true), so the only thing the call still
       produced was the error.
       This platform publishes no banner CMS, so there is nothing to repoint it
       at. `picList`/`picShow` went with it — nothing else read them — as did the
       swiper markup they fed. */
    getCoin(symbol) {
      return this.coins._map[symbol];
    },
    /* REMOVED: startWebsock(). It opened a SockJS/STOMP connection to
       `/market/market-ws` on the retired Java market service and pushed live
       thumb updates into the table.

       Not repointed, because our live feed is a different protocol on a
       different service (svc-ws) and wiring it is a piece of work in its own
       right, not a URL swap. What matters for honesty is what the absence
       costs: the table is a REST snapshot taken on load and it does not tick.
       It is not stale-but-live; it is simply a snapshot, and every figure in it
       was true when the page loaded. Nothing here pretends to stream. */
    addClass(index) {
      this.choseBtn = index;
      if (index === 0) {
        this.dataIndex = this.coins.favor;
        return;
      }
      var quote = this.quoteTabs[index - 1];
      this.dataIndex = quote ? this.coins[quote] || [] : [];
    },

    /**
     * The market list — `GET /api/v1/markets` + `GET /api/v1/tickers`.
     *
     * Was `POST /market/symbol-thumb-trend` on the retired Java market service.
     *
     * TABS ARE BUILT FROM THE LISTING, NOT HARDCODED. The vendor shipped three
     * fixed tabs (USDT, BTC, ETH). This venue also lists FX — EUR/USD, USD/JPY,
     * NATGAS/USD — and under fixed tabs those markets are listed, tradable and
     * invisible, which misrepresents what the venue offers. The quote assets
     * now come from whatever `/markets` actually returns.
     */
    getSymbol() {
      this.loading = true;
      this.marketsDown = false;

      Promise.all([rest("/markets"), rest("/tickers")]).then(results => {
        var marketsRes = results[0];
        var tickersRes = results[1];
        this.loading = false;

        if (!marketsRes.ok) {
          // Unreachable listing ≠ a venue with no markets.
          this.marketsDown = true;
          this.marketsMessage = marketsRes.message || "";
          return;
        }
        var marketsGate = ixTrade.accept(ixTrade.schemas.markets, marketsRes.data);
        if (!marketsGate.ok) {
          this.marketsDown = true;
          this.marketsMessage = marketsGate.message || "";
          return;
        }

        // Tickers may fail on their own. The listing is still true, so the
        // markets are shown with no price rather than hidden — a missing last
        // price prints "Not traded" (never 0, never the string "null").
        // Shape failure on tickers is the same class of lie as missing — no last.
        var tickers = {};
        if (tickersRes.ok && tickersRes.data) {
          var tickersGate = ixTrade.accept(ixTrade.schemas.tickers, tickersRes.data);
          if (tickersGate.ok) tickers = tickersGate.data;
        }
        var rows = ixTrade.toMarketRows(marketsGate.data, tickers);

        var buckets = {};
        var quotes = [];
        var map = {};
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          row.price = row.close;
          row.isFavor = this.localFavorites.indexOf(row.symbol) >= 0;
          map[row.symbol] = row;
          if (!buckets[row.base]) {
            buckets[row.base] = [];
            quotes.push(row.base);
          }
          buckets[row.base].push(row);
        }
        quotes.sort();

        this.coins._map = map;
        for (var q = 0; q < quotes.length; q++) {
          this.$set(this.coins, quotes[q], buckets[quotes[q]]);
        }
        this.quoteTabs = quotes;
        this.coins.favor = rows.filter(function (r) { return r.isFavor; });
        this.rebuildTabs();
        this.addClass(this.choseBtn);
      });
    },

    /** Tab labels follow the listing. "Watchlist" stays first and is local. */
    rebuildTabs() {
      var tabs = [{ text: this.$t("intafaced.trade.watchlistTab") }];
      for (var i = 0; i < this.quoteTabs.length; i++) {
        tabs.push({ text: this.quoteTabs[i] });
      }
      this.indexBtn = tabs;
    },
    /**
     * FAVOURITES ARE LOCAL TO THIS BROWSER, AND THE SCREEN SAYS SO.
     *
     * The vendor stored them server-side via `/exchange/favor/*` on the retired
     * Java exchange. Our surface has no favourites endpoint — it is a CCXT
     * contract, and a watchlist is not part of it.
     *
     * localStorage is the honest substitute BECAUSE a watchlist is a display
     * preference and not money or account state, so losing it on another device
     * costs nothing and misleads nobody. The label calls it a watchlist rather
     * than implying it follows the account. Inventing a server round trip that
     * silently did nothing would have been the alternative, and a star that
     * un-sets itself on reload is exactly the kind of small lie that teaches a
     * user not to trust the rest of the screen.
     */
    favoritesKey() {
      return "ix.watchlist.v1";
    },
    loadFavorites() {
      try {
        var raw = window.localStorage.getItem(this.favoritesKey());
        var list = raw ? JSON.parse(raw) : [];
        this.localFavorites = Array.isArray(list) ? list.filter(function (s) { return typeof s === "string"; }) : [];
      } catch (e) {
        this.localFavorites = [];
      }
    },
    saveFavorites() {
      try {
        window.localStorage.setItem(this.favoritesKey(), JSON.stringify(this.localFavorites));
      } catch (e) {
        /* private mode / quota — the watchlist is not worth an error toast */
      }
    },
    collect(index, row) {
      if (this.localFavorites.indexOf(row.symbol) < 0) {
        this.localFavorites.push(row.symbol);
        this.saveFavorites();
      }
      var coin = this.getCoin(row.symbol);
      if (coin) coin.isFavor = true;
      row.isFavor = true;
      if (!this.coins.favor.some(function (r) { return r.symbol === row.symbol; })) {
        this.coins.favor.push(coin || row);
      }
      this.$Message.info(this.$t("exchange.do_favorite"));
    },
    cancelCollect(index, row) {
      var at = this.localFavorites.indexOf(row.symbol);
      if (at >= 0) {
        this.localFavorites.splice(at, 1);
        this.saveFavorites();
      }
      var coin = this.getCoin(row.symbol);
      if (coin) coin.isFavor = false;
      row.isFavor = false;
      for (var i = 0; i < this.coins.favor.length; i++) {
        if (this.coins.favor[i].symbol === row.symbol) {
          this.coins.favor.splice(i, 1);
          break;
        }
      }
      this.$Message.info(this.$t("exchange.cancel_favorite"));
    }
  }
};
</script>
<style scoped>
.home-showcase { max-width: 1280px; margin: 0 auto; padding: 0 48px; color: var(--ix-text); }
.home-hero { display: grid; grid-template-columns: 1.25fr 1fr; gap: 70px; align-items: center; padding: 76px 0 68px; }
.home-eyebrow, .home-section-label, .home-workspaces-caption, .home-workspace-index { font: 10px/1.5 ui-monospace, Menlo, Consolas, monospace; letter-spacing: .13em; color: #969696; }
.home-eyebrow { margin-bottom: 25px; }
.home-hero h1 { margin: 0; color: #f0f0f0; font-size: clamp(52px, 5.5vw, 80px); font-weight: 500; line-height: 1.02; letter-spacing: -.065em; }
.home-intro { max-width: 430px; margin: 26px 0 0; font-size: 16px; line-height: 1.65; color: #a0a0a0; }
.home-hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
.home-hero-actions a { display: inline-flex; gap: 24px; align-items: center; justify-content: space-between; min-height: 46px; padding: 0 18px; font-size: 12px; font-weight: 600; }
.home-primary { background: var(--ix-orange); color: var(--ix-on-accent); border: 1px solid var(--ix-orange); }
.home-primary:hover { background: var(--ix-orange-light); color: var(--ix-on-accent); }
.home-secondary { border: 1px solid #343434; color: #d8d8d8; }
.home-secondary:hover { border-color: #888; color: #fff; }
.home-preview-note { max-width: 360px; margin-top: 20px; color: #8a8a8a; font-size: 11px; line-height: 1.6; }
.home-workspaces { border: 1px solid #303030; }
.home-workspaces-caption { display: flex; justify-content: space-between; padding: 16px 22px; background: #090909; border-bottom: 1px solid #303030; }
.home-workspace { display: grid; grid-template-columns: 24px 1fr 24px; gap: 15px; padding: 23px 22px; border-bottom: 1px solid #282828; color: #c8c8c8; }
.home-workspace:last-child { border-bottom: 0; }
.home-workspace:hover { background: #0c0c0c; color: #fff; }
.home-workspace-index { padding-top: 5px; }
.home-workspace h2 { color: #e8e8e8; margin: 0 0 5px; font-size: 24px; font-weight: 500; letter-spacing: -.03em; }
.home-workspace p { font-size: 13px; margin: 0 0 6px; color: #b0b0b0; }
.home-workspace div > span { font-size: 10px; color: #8a8a8a; }
.home-workspace b { font-size: 21px; font-weight: 400; color: #999; }
.home-platform { display: grid; grid-template-columns: .65fr 1fr 1fr; gap: 40px; padding: 46px 0; border-top: 1px solid #303030; border-bottom: 1px solid #303030; }
.home-platform h2, .home-access h2 { font-size: 34px; font-weight: 500; color: #e4e4e4; line-height: 1.15; letter-spacing: -.04em; }
.home-platform-copy p { font-size: 13px; line-height: 1.7; color: #999; }
.home-platform-copy a { display: inline-flex; gap: 24px; align-items: center; min-height: 44px; margin-top: 8px; color: #dedede; font-size: 12px; }
.home-access { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; padding: 44px 0 56px; }
.home-access h2 { margin: 12px 0; font-size: 28px; }
.home-access p { color: #999; line-height: 1.6; }
.home-access-details { align-self: center; border: 1px solid #343434; }
.home-access-details > summary { display: flex; justify-content: space-between; align-items: center; padding: 20px; cursor: pointer; font-size: 14px; color: #d8d8d8; list-style: none; }
.home-access-details > summary::-webkit-details-marker { display: none; }
.home-access-details[open] > summary { border-bottom: 1px solid #282828; }
.home-access-forms { padding: 20px; }
.ix-waitlist-card + .ix-waitlist-card { margin-top: 24px; padding-top: 24px; border-top: 1px solid #303030; }
.ix-waitlist-card h2 { font-size: 18px; margin-top: 0; }
.ix-waitlist-card p { margin: 0 0 14px; font-size: 12px; }
.ix-waitlist-card form { display: grid; gap: 10px; }
.ix-waitlist-card input, .ix-waitlist-card select { box-sizing: border-box; width: 100%; min-height: 42px; padding: 10px; border: 1px solid #343434; background: #090909; color: #ddd; border-radius: 0; }
.ix-waitlist-card button { min-height: 42px; padding: 10px 14px; cursor: pointer; background: var(--ix-orange); color: var(--ix-on-accent); border: 0; }
.ix-waitlist-position { display: grid; gap: 10px; margin-top: 18px; }
.ix-waitlist-position button { background: #111; color: #ddd; border: 1px solid #343434; }
.ix-waitlist-unbuilt { margin-top: 12px; color: #c8c8c8; }
.home-market { padding: 36px 0; border-bottom: 1px solid #303030; }
.home-market .page2nav ul { display: flex; gap: 16px; align-items: center; margin: 16px 0; }
.home-market .page2nav li { cursor: pointer; }
.home-market .ptjy { overflow-x: auto; }
.home-showcase a:focus-visible, .home-showcase summary:focus-visible, .home-showcase input:focus-visible, .home-showcase button:focus-visible { outline: 2px solid var(--ix-orange); outline-offset: 4px; }
@media (max-width: 900px) {
 .home-showcase { padding: 0 28px; }
 .home-hero { gap: 32px; padding-top: 48px; }
 .home-hero h1 { font-size: 57px; }
 .home-platform { grid-template-columns: 1fr 1fr; gap: 24px; }
 .home-platform > .home-section-label { grid-column: 1 / -1; }
}
@media (max-width: 600px) {
 .home-showcase { padding: 0 20px; }
 .home-hero { grid-template-columns: 1fr; padding: 40px 0 32px; gap: 32px; }
 .home-hero h1 { font-size: clamp(44px, 13vw, 62px); line-height: 1.04; }
 .home-eyebrow { font-size: 9px; margin-bottom: 22px; }
 .home-intro { margin-top: 20px; font-size: 14px; }
 .home-hero-actions { gap: 10px; margin-top: 24px; }
 .home-hero-actions a { padding: 0 12px; gap: 12px; font-size: 11px; }
 .home-preview-note { font-size: 10px; }
 .home-workspace { padding: 18px; gap: 12px; }
 .home-workspace h2 { font-size: 23px; }
 .home-workspaces-caption { padding: 14px 18px; font-size: 9px; }
 .home-platform { grid-template-columns: 1fr; padding: 32px 0; gap: 22px; }
 .home-platform h2 { font-size: 32px; }
 .home-access { grid-template-columns: 1fr; gap: 24px; padding: 32px 0; }
}
</style>
