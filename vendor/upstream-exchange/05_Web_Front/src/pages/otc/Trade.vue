<template>
  <div class="nav-right tradeCenter">
    <section class="list-content">
      <IxState
        :loading="offers.loading"
        :reason="offers.reason"
        :message="offers.message"
        endpoint="/api/p2p/trpc/offers.list"
      >
        <Tabs :value="tabPage" v-model="tabPage">
          <!--
            SIDE, FROM THE READER'S POINT OF VIEW.

            offers.list returns the MAKER's side: an offer with side "sell" is a
            maker selling the asset, which is the offer a reader BUYS from. The
            vendor's two tabs meant the same thing, and its columns were built
            from an `advertiseType` integer — exactly the kind of mapping that
            gets inverted in a refactor and silently sells someone the wrong
            side. Naming the tabs after what the reader does, and deriving them
            from the maker side in one place (`buyable` / `sellable`), keeps the
            inversion in a single expression instead of scattered through render
            functions.
          -->
          <TabPane :label="$t('otc.buyin')" name="buy">
            <div class="table-responsive list-table">
              <p v-if="!buyable.length" class="ix-empty">{{ $t('otc.adsEmpty') }}</p>
              <div v-else class="ix-scroll">
                <table class="ix-table">
                  <thead>
                    <tr>
                      <th>{{ $t('otc.maker') }}</th>
                      <th>{{ $t('otc.price') }}</th>
                      <th>{{ $t('otc.limits') }}</th>
                      <th>{{ $t('otc.available') }}</th>
                      <th>{{ $t('otc.paymethod') }}</th>
                      <th>{{ $t('otc.operate') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="o in buyable" :key="o.id">
                      <td>{{ maskMaker(o.makerId) }}</td>
                      <td class="ix-num">{{ o.price }} {{ o.fiatCurrency }}</td>
                      <td class="ix-num">{{ o.minAmount }} – {{ o.maxAmount }}</td>
                      <td class="ix-num">{{ o.remainingAmount }} {{ o.asset }}</td>
                      <td>{{ methodsOf(o) }}</td>
                      <td>
                        <a class="ix-act ix-act-buy" @click="openOffer(o)">{{ $t('otc.buyin') }}</a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </TabPane>
          <TabPane :label="$t('otc.sellout')" name="sell">
            <div class="table-responsive list-table">
              <p v-if="!sellable.length" class="ix-empty">{{ $t('otc.adsEmpty') }}</p>
              <div v-else class="ix-scroll">
                <table class="ix-table">
                  <thead>
                    <tr>
                      <th>{{ $t('otc.maker') }}</th>
                      <th>{{ $t('otc.price') }}</th>
                      <th>{{ $t('otc.limits') }}</th>
                      <th>{{ $t('otc.available') }}</th>
                      <th>{{ $t('otc.paymethod') }}</th>
                      <th>{{ $t('otc.operate') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="o in sellable" :key="o.id">
                      <td>{{ maskMaker(o.makerId) }}</td>
                      <td class="ix-num">{{ o.price }} {{ o.fiatCurrency }}</td>
                      <td class="ix-num">{{ o.minAmount }} – {{ o.maxAmount }}</td>
                      <td class="ix-num">{{ o.remainingAmount }} {{ o.asset }}</td>
                      <td>{{ methodsOf(o) }}</td>
                      <td>
                        <a class="ix-act ix-act-sell" @click="openOffer(o)">{{ $t('otc.sellout') }}</a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </TabPane>
        </Tabs>
        <p class="ix-cap-note">{{ $t('otc.listCap') }}</p>
      </IxState>
    </section>
  </div>
</template>

<style scoped lang="scss">
#List.nav-right {
  color: #1d1d1d;
  padding-right: 0;
.list-content {
    color: #fff;
  }
}
</style>
<style lang="scss">
#List.nav-right {
  color: #1d1d1d;
  padding-right: 0;
.list-content {
    color: #fff;
.ivu-tabs {
.ivu-tabs-bar {
        border-bottom:none;
.ivu-tabs-nav-container {
.ivu-tabs-nav-wrap {
.ivu-tabs-nav-scroll {
.ivu-tabs-ink-bar.ivu-tabs-ink-bar-animated {
                background: #ff8534;
              }
.ivu-tabs-tab {
                &:hover {
                  color: #ff8534;
                }
              }
.ivu-tabs-tab.ivu-tabs-tab-active.ivu-tabs-tab-focused {
                color: #ff8534;
              }
            }
          }
        }
      }
.ivu-tabs-content.ivu-tabs-content-animated {
.ivu-tabs-tabpane {
.ivu-table-wrapper {
            border: none;
.ivu-table-body{
.ivu-table-tbody{
.ivu-table-row{
.ivu-table-cell.ivu-table-cell-ellipsis{
.user-face.user-avatar-public{
                      span{
                        background:#ff8534;
                      }
                    }
                    p a{
                      color:#ff8534;
                    }
                  }
                }
              }
            }
          }
.page_change{
            margin: 10px;
            overflow: hidden;
          }
        }
      }
    }
  }
}
.tradeCenter button span,
.tradeCenter button a,
.tradeCenter button a:hover {
  display: block;
  color: white;
}

.tradeCenter.ivu-poptip-popper button span {
  display: block;
  color: inherit;
}

#carousel {
  margin-bottom: 40px;
}

// #List.nav-right.bread {
// font-size: 16px;
// }

// #List.nav-right.bread a {
// color: #e24a64;
// display: inline-block;
// padding-left: 1rem;
// cursor: pointer;
// }

// #List.nav-right.list-content.list-title {
// box-shadow: 0 4px 0 0 rgba(69, 112, 128, 0.06);
// -webkit-box-shadow: 0 4px 0 0 rgba(69, 112, 128, 0.06);
// z-index: 1;
// position: relative;
// }

// #List.nav-right.list-content.list-title.search {
// background-color: #fff;
// height: 40px;
// padding: 6px 12px;
// }

// #List.nav-right.list-content.list-title.search.dropdown-box {
// display: flex;
// flex: 1;
// justify-content: flex-start;
// align-items: center;
// height: 100%;
// }

// #List.nav-right.list-content.list-title.search.dropdown-box.select-menu {
// border: transparent;
// outline: none;
// background-color: transparent;
// }

// #List.nav-right.list-content.list-title.search.dropdown-box.select-items {
// width: 25%;
// display: flex;
// justify-content: flex-start;
// align-items: center;
// }

//.nav.open > a,
//.nav.open > a:hover,
//.nav.open > a:focus {
// background: transparent;
// }

// #List.nav-right.list-content.list-title.search-btn {
// background-color: #cccccc;
// display: flex;
// justify-content: center;
// border-radius: 0 4px 4px 0;
// }

// #List.nav-right.list-content.list-title.search-btn span {
// font-size: 18px;
// height: 36px;
// line-height: 36px;
// }

// #List.nav-right.list-content.list-title.search-btn em {
// height: 36px;
// line-height: 36px;
// margin-left: 6px;
// font-style: normal;
// }

// #List.nav-right.list-content.list-table table {
// table-layout: fixed;
// }

// #List.nav-right.list-content.list-table tr:nth-of-type(even) {
// background-color: #fff;
// }

// #List.nav-right.list-content.list-table tr > td {
// vertical-align: middle;
// line-height: normal;
// width: 25%;
// }

// #List.nav-right.list-content.list-table.table > tbody > tr > td {
// border-top: 1px solid transparent;
// text-align: left;
// height: 75px;
// }
//.ivu-menu-light.ivu-menu-vertical.ivu-menu-item-active:not(.ivu-menu-submenu) {
// color: #ff6b00;
// }
// #List.nav-right.list-content.list-table.user-name {
// display: flex;
// justify-content: flex-start;
// padding-left: 5%;
// }

// #List.nav-right.list-content.list-table.user-name.user-icon {
// background: #ff6b00;
// border-radius: 50%;
// height: 42px;
// width: 42px;
// display: flex;
// justify-content: center;
// }

#List.nav-right.list-content.list-table.user-name.user-icon span {
  font-size: 22px;
  color: white;
  align-self: center;
}

#List.nav-right.list-content.list-table.user-name.user-info {
  margin-left: 5%;
  width: 100px;
  word-wrap: inherit;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

#List.nav-right.list-content.list-table.user-name.user-info p {
  height: 16px;
  margin: 0 0 3px;
}

// #List.nav-right.list-content.list-table.user-name.user-info.merchant {
// height: 17px;
// width: 67px;
// display: inline-block;
  /* background: url("../../images/comm/merchant-flag.png") no-repeat; */
// }

// #List.nav-right.list-content.list-table.price p {
// font-size: 16px;
// font-weight: bolder;
// color: #393939;
// }

// #List.nav-right.list-content.list-table.price h5 {
// font-size: 12px;
// color: #909090;
// margin-top: 0;
// }

// #List.nav-right.list-content.list-table.Btn a {
// border-radius: 6px;
// background-color: transparent;
// color: #e24a64;
// display: inline-block;
// padding: 6px;
// width: 100px;
// text-align: center;
// text-decoration: none;
// }

// #List.nav-right.list-content.list-table.Btn.sell {
// background-color: #0db124;
// color: #fff;
// }

// #List.nav-right.list-content.list-table.Btn.buy {
// background-color: #ed7325;
// color: #fff;
// }

#List.nav-right.list-content.pagelist {
  display: flex;
  justify-content: flex-end;
}

#List.nav-right.list-content.pagelist ul {
  list-style: none;
}

#List.nav-right.list-content.pagelist ul li {
  display: inline-block;
  background-color: #ebeff5;
  height: 32px;
  width: 32px;
  text-align: center;
  line-height: 32px;
  border: 1px solid #cccccc;
  border-radius: 6px;
  cursor: pointer;
  margin: 0 2px;
}

#List.nav-right.list-content.pagelist ul li:hover {
  background-color: #cccccc;
}

#List.nav-right.list-content.pagelist ul li a {
  color: #1d1d1d;
}

#List.header-search {
  width: 100%;
}

#List.select-items select {
  width: initial;
}

#List.list-payMethod {
  width: 80%;
  display: inline-block;
  word-break: keep-all;
}

.select-items.form-control {
  -webkit-box-shadow: none;
  box-shadow: none;
}

.nav-pills.dropdown a {
  color: #555555!important;
}

.has-success.control-label {
  color: #1d1d1d!important;
}

.trade-group {
  margin-bottom: 20px;
  font-size: 14px;
}

.merchant-icon {
  display: inline-block;
  margin-left: 4px;
  background-size: 100% 100%;
}

.merchant-icon.tips {
  width: 4px;
  height: 22px;
  margin-right: 10px;
  background: #ff6b00;
}

.merchant-icon.alipay {
  width: 17px;
  height: 17px;
  background-image: url(../../assets/img/alipay.png);
}

.merchant-icon.bankcard {
  width: 17px;
  height: 17px;
  background-image: url(../../assets/img/bankcard.png);
}

.merchant-icon.wechat {
  width: 17px;
  height: 17px;
  background-image: url(../../assets/img/wechat.png);
}

.merchant-icon.westernunion {
  width: 17px;
  height: 17px;
}

.merchant-icon.paytm {
  width: 29px;
  height: 17px;
}

.merchant-icon.m-booth {
  width: 131px;
  height: 94px;
  background-position: 0 -220px;
}

.merchant-icon.m-server {
  width: 158px;
  height: 94px;
  background-position: 0 -335px;
}

.merchant-icon.m-rate {
  width: 125px;
  height: 94px;
  background-position: 0 -110px;
}

.merchant-icon.m-ok {
  width: 23px;
  height: 9px;
  background-position: -100px 0;
}

.merchant-top {
  display: flex;
  align-items: center;
  // background: #fff;
  padding: 0 15px;
  color: #fff;
}

.merchant-top.tips-word {
  flex-grow: 2;
  text-align: left;
}

.merchant-item {
  padding: 20px 15px 20px 15px;
  background: #fff;
  width: 31%;
  float: left;
  margin: 0 1%;
}

.merchant-item.center {
  margin: 0 1.5%;
}

.merchant-item.item-hd {
  /* background: url("../../images/trade/merchant_item_split.png") left bottom no-repeat; */
  padding-bottom: 20px;
  display: flex;
  align-items: center;
}

.merchant-item.item-hd.item-face {
  width: 42px;
  height: 42px;
  text-align: center;
  line-height: 42px;
  border-radius: 42px;
  -webkit-border-radius: 42px;
  color: #fff;
  background: #ff6b00;
}

.merchant-item.item-hd.item-name {
  padding: 0 10px;
}

.merchant-item.item-hd.item-name p {
  margin-bottom: 0;
}

.merchant-item.item-hd.item-name p:first-child {
  color: #fff;
  margin-bottom: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.merchant-item.item-hd.item-name p:last-child {
  color: #4c4c4c;
  font-size: 12px;
}

.merchant-item.text-right {
  display: flex;
  justify-content: flex-end;
}

.merchant-item.text-right.online-status-box {
  color: #18b111;
  display: flex;
}

.merchant-item.item-hd.item-pay {
  flex-grow: 2;
  text-align: right;
}

.merchant-item.item-hd.item-pay.states {
  height: 17px;
  width: 67px;
  display: inline-block;
}

.merchant-item.item-hd.item-pay.states.merchant {
  background: url("../../assets/img/renzheng.png") no-repeat;
  background-size: 100% 100%;
}

.merchant-item.item-hd.item-pay p {
  font-size: 12px;
  color: #ed7325;
  margin-bottom: 5px;
}

.merchant-item.item-bd {
  padding-top: 10px;
}

.merchant-item.item-bd.price {
  font-size: 16px;
  color: #313131;
  font-weight: bold;
}

.merchant-item.item-bd.price span {
  font-size: 12px;
}

.merchant-item.item-bd.limit {
  color: #4c4c4c;
  font-size: 12px;
  padding-bottom: 15px;
}

.merchant-item.item-bd.btn {
  height: 32px;
  line-height: 32px;
  font-size: 14px;
  color: #fff;
  padding: 0 12px;
  border-radius: 6px;
  -webkit-border-radius: 6px;
}

.merchant-item.item-bd.btn-buy {
  background: #ed7325;
}

.merchant-item.item-bd.btn-sell {
  background: #0db124;
}

.merchant-items {
  margin-bottom: 40px;
}

.carousel-indicators li {
  width: 30px;
  height: 5px;
  border-radius: 5px;
  -webkit-border-radius: 3px;
  border: none;
  background: #d4d6e1;
}

.carousel-indicators.active {
  width: 30px;
  height: 5px;
  border-radius: 5px;
  -webkit-border-radius: 3px;
  border: none;
  background: #7f8bc6;
  margin: 1px;
}

.carousel-indicators {
  bottom: -30px;
}

.m-intro {
  width: 33.33%;
  float: left;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
}

.m-intro p {
  color: #393939;
  font-weight: bold;
  font-size: 16px;
}

.m-subtitle {
  line-height: 40px;
  padding-left: 20px;
  background: #f7f7fa;
  color: #4c4c4c;
  font-size: 12px;
}

.m-data-lf {
  width: 20%;
  float: left;
  display: flex;
  align-items: center;
}

.m-data-cn {
  width: 45%;
  float: left;
  display: flex;
  align-items: center;
}

.m-data-rf {
  width: 35%;
  float: left;
  display: flex;
  align-items: center;
}

.online-status-box {
  height: 20px;
}

.headerimg {
  color: rgb(245, 106, 0);
  background-color: rgb(253, 227, 207);
  display: inline-block;
  width: 40px;
  height: 40px;
  line-height: 40px;
  text-align: center;
  border-radius: 50%;
  margin-right: 5px;
}

.headerimg ~ p {
  display: inline-block;
}

//.price {
// font-size: 16px;
// font-weight: bolder;
// color: #393939;
// }

//.price2 {
// font-size: 12px;
// color: #909090;
// margin-top: 0;
// }

.renzheng {
  height: 17px;
  width: 67px;
  display: inline-block;
  background: url("../../assets/img/renzheng.png") no-repeat;
  background-size: 100% 100%;
  transform: translateY(-10px);
  display: block;
}

.renzhengA {
  transform: translateY(-10px);
  display: block;
}

.tjbtn {
  width: 80%;
}

.user-avatar-public {
  background: #fff;
  border-radius: 50%;
  height: 45px;
  width: 30px;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 0 1px 5px 0 rgba(71, 78, 114, 0.24);
  position: relative;
}

.user-avatar-public >.user-avatar-in {
  background: #ff6b00;
  border-radius: 50%;
  height: 35px;
  width: 35px;
  display: flex;
  justify-content: center;
  align-items: center;
  color: white;
}

.ivu-table-cell.user-avatar-public {
  width:45px;
  display: inline-block;
  margin: 10px 10px 10px 0;
  vertical-align: middle;
}

.ivu-table-cell.user-avatar-public >.user-avatar-in {
  transform: translate(5px, 5px);
}

.ivu-table-cell.user-avatar-public ~ p {
  /*width: 60%;*/
  display: inline-block;
}

/* additions */
//.list-content
//.ivu-table-body
//.ivu-table-tbody
//.ivu-table-cell.ivu-table-cell-ellipsis
// p
// a {
// color: #ff6b00;
// }
//.list-content {
//.ivu-tabs-bar {
//.ivu-tabs-nav-container {
//.ivu-tabs-ink-bar.ivu-tabs-ink-bar-animated {
// background: #ff6b00;
// }
//.ivu-tabs-tab.ivu-tabs-tab-active.ivu-tabs-tab-focused {
// color: #ff6b00;
// }
//.ivu-tabs-tab {
// &:hover {
// color: #ff6b00;
// }
// }
// }
// }
// }
</style>

<style scoped>
.ix-act {
  cursor: pointer;
  font-weight: 600;
}
.ix-act-buy { color: var(--ix-up, #00b275); }
.ix-act-sell { color: var(--ix-down, #f15057); }
/* Money is a decimal string. Tabular figures align the columns without anything
   rounding or reformatting the value to achieve it. */
.ix-num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ix-cap-note {
  margin: 10px 0 0;
  font-size: 11.5px;
  color: var(--ix-text-faint, #6b7280);
}
</style>

<script>
/**
 * THE OFFER LIST for one asset — svc-p2p `offers.list`.
 *
 * MONEY. `price`, `minAmount`, `maxAmount` and `remainingAmount` arrive as
 * decimal strings and are rendered as decimal strings. Nothing here parses,
 * multiplies, rounds or reformats them. The vendor's version pushed every
 * figure through iView render functions that concatenated it with a hardcoded
 * "CNY"; this reads `fiatCurrency` off each offer, because svc-p2p serves the
 * enabled-currency table and the currency of an offer is a property of that
 * offer, not of the page.
 *
 * FILTERING IS SERVER-SIDE. `offers.list` accepts `{ asset, fiatCurrency, side,
 * limit }`. Asking it for one asset is both less data over the wire and less
 * opportunity to disagree with the tab strip in Main.vue, which derives its
 * tabs from the same procedure.
 *
 * PAGINATION IS GONE, and that is a real reduction rather than an oversight.
 * The vendor paged with `pageNo`/`pageSize` against a Java endpoint that
 * returned `totalElement`. `offers.list` has no cursor and no total — it takes
 * `limit` (max 200) and returns an array. Rendering a pager over a list with no
 * total would have meant inventing the page count, so the list is capped and
 * the cap is stated on screen.
 */
import IxState from "../../components/intafaced/IxState.vue";
import ixModule from "../../components/intafaced/module-mixin.js";
import { query } from "../../config/intafaced.js";

/** The contract ceiling. Named so the copy and the call cannot drift apart. */
var LIST_LIMIT = 200;

export default {
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      offers: this.emptySection(),
      tabPage: "buy"
    };
  },
  computed: {
    isLogin: function () {
      return this.$store.getters.isLogin;
    },
    member: function () {
      return this.$store.getters.member;
    },
    coin: function () {
      return this.$route.params[0];
    },
    rows: function () {
      return this.offers.data || [];
    },
    /** Maker is selling, so the reader can buy. */
    buyable: function () {
      return this.rows.filter(function (o) {
        return o.side === "sell" && o.status === "active";
      });
    },
    /** Maker is buying, so the reader can sell. */
    sellable: function () {
      return this.rows.filter(function (o) {
        return o.side === "buy" && o.status === "active";
      });
    }
  },
  watch: {
    coin: function () {
      this.reloadAd();
    }
  },
  methods: {
    reloadAd() {
      var input = { limit: LIST_LIMIT };
      if (this.coin) input.asset = String(this.coin).toUpperCase();
      this.load("offers", query("p2p", "offers.list", input, this.ixToken));
    },
    /**
     * Payment methods, as the offer states them.
     *
     * `methods` is `z.array(z.unknown())` in the contract — svc-p2p does not
     * constrain the shape, so this renders what is there without asserting a
     * schema it has not been promised. An offer with no methods says so rather
     * than rendering an empty cell that reads as "any method".
     */
    methodsOf(offer) {
      var m = offer.methods;
      if (!m || !m.length) return this.$t("otc.noMethods");
      var names = [];
      for (var i = 0; i < m.length; i++) {
        var x = m[i];
        if (x == null) continue;
        if (typeof x === "string") {
          names.push(x);
        } else {
          // A named object is the likely future shape. Fall through to nothing
          // rather than printing "[object Object]" at a reader.
          var n = x.name || x.method || x.type;
          if (n) names.push(String(n));
        }
      }
      return names.length ? names.join(", ") : this.$t("otc.noMethods");
    },
    /**
     * The maker, shown partially.
     *
     * `makerId` is a user id, not a display name — svc-p2p carries no nickname
     * and this screen will not invent one. Showing it in full would hand a
     * stable identifier to anyone browsing the book, so it is truncated the way
     * the vendor truncated its usernames.
     */
    maskMaker(makerId) {
      if (!makerId) return "—";
      var s = String(makerId);
      return s.length <= 8 ? s : s.slice(0, 8) + "…";
    },
    openOffer(offer) {
      if (!this.isLogin) {
        this.$router.push("/login");
        return;
      }
      this.$router.push("/otc/tradeInfo?offerId=" + offer.id);
    }
  },
  created() {
    this.reloadAd();
  }
};
</script>
