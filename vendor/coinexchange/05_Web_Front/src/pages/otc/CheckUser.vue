<template>
  <div class="content-wrap">
    <div class="container" id="List">
      <section class="merchant-top">
        <span class="tips-word">{{ maskUser(userId) }}</span>
      </section>

      <div class="tabbox">
        <h3 class="sec-title">{{ $t('otc.checkuser.reputation') }}</h3>
        <IxState
          :loading="rep.loading"
          :reason="rep.reason"
          :message="rep.message"
          endpoint="/api/p2p/trpc/reputation.get"
        >
          <div v-if="rep.data" class="rep-grid">
            <div class="rep-cell">
              <span class="k">{{ $t('otc.tradeinfo.exchangetimes') }}</span>
              <span class="v">{{ rep.data.tradesTotal }}</span>
            </div>
            <div class="rep-cell">
              <span class="k">{{ $t('otc.rep.completed') }}</span>
              <span class="v">{{ rep.data.completed }}</span>
            </div>
            <div class="rep-cell">
              <span class="k">{{ $t('otc.rep.cancelled') }}</span>
              <span class="v">{{ rep.data.cancelled }}</span>
            </div>
            <div class="rep-cell">
              <span class="k">{{ $t('otc.rep.disputed') }}</span>
              <span class="v">{{ rep.data.disputed }}</span>
            </div>
            <div class="rep-cell">
              <span class="k">{{ $t('otc.rep.disputesLost') }}</span>
              <span class="v">{{ rep.data.disputesLost }}</span>
            </div>
            <div class="rep-cell">
              <span class="k">{{ $t('otc.rep.completionRate') }}</span>
              <span class="v">{{ completionPercent }}</span>
            </div>
            <div class="rep-cell" v-if="rep.data.avgReleaseSecs > 0">
              <span class="k">{{ $t('otc.rep.avgRelease') }}</span>
              <span class="v">{{ rep.data.avgReleaseSecs }}s</span>
            </div>
            <div class="rep-cell">
              <span class="k">{{ $t('otc.rep.badges') }}</span>
              <span class="v">{{ rep.data.badges.length ? rep.data.badges.join(', ') : $t('otc.rep.none') }}</span>
            </div>
          </div>
        </IxState>

        <!--
          The vendor showed email / phone / ID verification badges for the
          counterparty here, read off its own member record. Nothing behind our
          edge exposes another user's verification state — svc-identity's
          `kyc.status` is self-only by design — so rendering the badges would
          mean asserting something unchecked about a stranger. The reputation
          counts above replace them and are read from svc-p2p.
        -->

        <h3 class="sec-title">{{ $t('otc.checkuser.theirOffers') }}</h3>
        <IxState
          :loading="offers.loading"
          :reason="offers.reason"
          :message="offers.message"
          endpoint="/api/p2p/trpc/offers.list"
        >
          <Tabs value="buy">
            <TabPane :label="$t('otc.buyin')" name="buy">
              <p v-if="!theirSells.length" class="ix-empty">{{ $t('otc.adsEmpty') }}</p>
              <div v-else class="ix-scroll">
                <table class="ix-table">
                  <thead>
                    <tr>
                      <th>{{ $t('otc.asset') }}</th>
                      <th>{{ $t('otc.price') }}</th>
                      <th>{{ $t('otc.limits') }}</th>
                      <th>{{ $t('otc.available') }}</th>
                      <th>{{ $t('otc.operate') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="o in theirSells" :key="o.id">
                      <td>{{ o.asset }}</td>
                      <td class="ix-num">{{ o.price }} {{ o.fiatCurrency }}</td>
                      <td class="ix-num">{{ o.minAmount }} – {{ o.maxAmount }}</td>
                      <td class="ix-num">{{ o.remainingAmount }}</td>
                      <td><router-link :to="'/otc/tradeInfo?offerId=' + o.id">{{ $t('otc.buyin') }}</router-link></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </TabPane>
            <TabPane :label="$t('otc.sellout')" name="sell">
              <p v-if="!theirBuys.length" class="ix-empty">{{ $t('otc.adsEmpty') }}</p>
              <div v-else class="ix-scroll">
                <table class="ix-table">
                  <thead>
                    <tr>
                      <th>{{ $t('otc.asset') }}</th>
                      <th>{{ $t('otc.price') }}</th>
                      <th>{{ $t('otc.limits') }}</th>
                      <th>{{ $t('otc.available') }}</th>
                      <th>{{ $t('otc.operate') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="o in theirBuys" :key="o.id">
                      <td>{{ o.asset }}</td>
                      <td class="ix-num">{{ o.price }} {{ o.fiatCurrency }}</td>
                      <td class="ix-num">{{ o.minAmount }} – {{ o.maxAmount }}</td>
                      <td class="ix-num">{{ o.remainingAmount }}</td>
                      <td><router-link :to="'/otc/tradeInfo?offerId=' + o.id">{{ $t('otc.sellout') }}</router-link></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </TabPane>
          </Tabs>
        </IxState>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container {
  padding-top: 30px;
  margin: 0 auto;
  width: 1200px;
  background: #000000;
  margin-bottom: 20px;
}
.content-wrap {
  /* background: #f5f5f5; */
  min-height: 600px;
  padding-top: 80px;
}
/* right */

.tabbox {
  margin-left: 20px;
  
  padding: 20px 15px;
}

.merchant-top {
  height: 50px;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-align: center;
  -ms-flex-align: center;
  align-items: center;
  padding: 0 15px;
  color: #fff;
  margin-left: 20px;
}

.merchant-icon {
  width: 4px;
  height: 22px;
  margin-right: 10px;
  background: #00c2a8;
  display: inline-block;
  margin-left: 4px;
}

.tips-word {
  -webkit-box-flex: 2;
  -ms-flex-positive: 2;
  flex-grow: 2;
  text-align: left;
  font-size: 14px;
}

.tit div {
  color: #a2a2a2;
}

.trade-right-box {
  margin-left: 33px;
  margin-right:15px;
  text-align: left;
}

.trade-right-box.trade-price {
  padding: 15px 0;
  
  border: 1px solid #141414;
  margin-bottom: 20px;
}

.trade-right-box.trade-price p {
  color: #fff;
  font-size: 14px;
  line-height: 2.8;
}

.trade-right-box.trade-price p label {
  min-width: 80px;
  display: inline-block;
}

.trade-right-box.trade-price p span {
  margin-left: 15%;
  display: inline-block;
}

.trade-right-box.trade-operation {
  padding: 20px;
  
  border: 1px solid #141414;
  margin-bottom: 20px;
}

.trade-right-box.trade-operation.trade-price-input {
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-align: center;
  -ms-flex-align: center;
  align-items: center;
  margin-bottom: 20px;
}

.trade-right-box.trade-operation.trade-price-input.price-input-list {
  border: 1px solid #cccccc;
  width: 45%;
}

.trade-right-box
.trade-operation
.trade-price-input
.price-input-list
.coin-name {
  background-color: #ebeff5;
  display: inline-block;
  padding: 10px 22px;
  font-size: 18px;
  color: #fff;
  border-right: 1px solid #cccccc;
}

.trade-right-box.trade-operation.trade-price-input.price-input-list > input {
  border: none;
  background-color: transparent;
  outline: none;
  padding: 10px;
  display: inline-block;
  width: 75%;
}

.trade-right-box.trade-operation.trade-price-input.exchange {
  width: 10%;
  text-align: center;
  font-size: 24px;
}

.trade-right-box.trade-operation.trade-price-input.price-input-list {
  border: 1px solid #cccccc;
  width: 45%;
}

.trade-right-box.trade-operation.text-inputs {
  background-color: #000000;
  border: 1px solid #cccccc;
  outline: none;
  display: block;
  height: 100px;
  width: 100%;
  resize: none;
  padding: 20px;
  margin-bottom: 20px;
  color: #ccc;
}

.trade-right-box.trade-operation.price-box {
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-align: center;
  -ms-flex-align: center;
  align-items: center;
}

.trade-right-box.trade-operation.price-box.show-price {
  border: 1px solid #cccccc;
  width: 80%;
  height: 58px;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-align: center;
  -ms-flex-align: center;
  align-items: center;
  padding-left: 10px;
}

.trade-right-box.trade-operation.price-box.show-price em {
  font-style: normal;
  font-size: 14px;
  color: #fff;
}

.trade-right-box.trade-operation.price-box.show-price span {
  font-size: 18px;
  color: #ee6543;
  font-weight: bolder;
}

.trade-right-box.trade-operation.price-box.btn-trade-in {
  outline: medium;
  border: 0;
  color: white;
  padding: 20px 26px;
  background-color: #ee6543;
  cursor: pointer;
  width: 20%;
  text-align: center;
}

.trade-right-box.trade-remark {
  
  border: 1px solid #141414;
  padding: 30px 36px;
  margin-bottom: 30px;
}

.trade-right-box.trade-remark.titles {
  margin-bottom: 15px;
}

.trade-right-box.trade-remark.titles span {
  font-size: 16px;
  color: #fff;
  padding-right: 30px;
}

.trade-right-box.trade-remark.content {
  margin-bottom: 30px;
  font-size: 14px;
  color: #909090;
  line-height: 1.8;
}

/* -- */

.icon1 {
  background: url("../../assets/img/btc.png") no-repeat 0 0;
  background-size: 100% 100%;
}

.icon2 {
  background: url("../../assets/img/usdt.png") no-repeat 0 0;
  background-size: 100% 100%;
}

/* left */

.leftmenu {
  margin-bottom: 60px;
  background-color: #000000;
  position: relative;
  min-height: 1px;
  padding: 50px 15px 50px 10px;
}

.left-box.user-info {
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-align: center;
  -ms-flex-align: center;
  align-items: center;
  padding-bottom: 15px;
  border-bottom: 1px dashed #ebeff5;
}

.avatar-box {
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-align: center;
  -ms-flex-align: center;
  align-items: center;
  -webkit-box-orient: vertical;
  -webkit-box-direction: normal;
  -ms-flex-direction: column;
  flex-direction: column;
}

.user-avatar-public {
  
  height: 65px;
  width: 65px;
  box-shadow: 0 1px 5px 0 rgba(71, 78, 114, 0.24);
  position: relative;
}

.user-avatar-public >.user-avatar-in,
.user-avatar-public {
  border-radius: 50%;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-pack: center;
  -ms-flex-pack: center;
  justify-content: center;
  -webkit-box-align: center;
  -ms-flex-align: center;
  align-items: center;
}

.user-avatar-public >.user-avatar-in {
  border-radius: 50%;
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-pack: center;
  -ms-flex-pack: center;
  justify-content: center;
  -webkit-box-align: center;
  -ms-flex-align: center;
  align-items: center;
  background: #00c2a8;
  height: 60px;
  width: 60px;
  color: #fff;
}

.left-box span.ml10 {
  color: #fff;
  margin-left: 5px;
}

.left-box.deal-market-info {
  padding: 20px 0 20px 20px;
  border-bottom: 1px dashed #ebeff5;
}

.left-box.deal-market-info p {
  display: -webkit-box;
  display: -ms-flexbox;
  display: flex;
  -webkit-box-align: center;
  -ms-flex-align: center;
  align-items: center;
  font-size: 14px;
  color: #fff;
}

.iconfont {
  font-family: iconfont!important;
  font-size: 16px;
  font-style: normal;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.left-box.deal-market-info p.iconfont {
  margin-right: 20px;
  font-size: 20px;
}

.left-box.deal-market-info p.iconfont:before {
  background-size: 100% 100%;
  width: 20px;
  height: 20px;
  display: inline-block;
  content: "";
}

.icon-youxiang:before {
  background-image: url(../../assets/img/t1-1.png);
}

.icon-youxiang111:before {
  background-image: url(../../assets/img/t1-2.png);
}

.icon-dianhua:before {
  background-image: url(../../assets/img/t2-1.png);
}

.icon-dianhua111:before {
  background-image: url(../../assets/img/t2-2.png);
}

.icon-renzheng:before {
  background-image: url(../../assets/img/t3-1.png);
}

.icon-renzheng111:before {
  background-image: url(../../assets/img/t3-2.png);
}

.left-box.deal-user-trade-info {
  padding-top: 20px;
  color: #909090;
}

.left-box.deal-user-trade-info p {
  margin-bottom: 6px;
}

.left-box.deal-user-trade-info p em {
  font-style: normal;
  color: #fff;
}
</style>

<style lang="scss">
.right-safe{
.ivu-tabs{
.ivu-tabs-bar{
.ivu-tabs-nav-container{
.nav-text.ivu-tabs-nav{
.ivu-tabs-tab.ivu-tabs-tab-active.ivu-tabs-tab-focused{
                            color: #00c2a8;
                        }
.ivu-tabs-ink-bar.ivu-tabs-ink-bar-animated{
                            background-color: #00c2a8;
                        }
.ivu-tabs-tab{
                            &:hover{
                                color: #00c2a8;
                            }
                        }
                    }
                }
            }
        }
    }
.right-safe.demo-tabs-style1.tabbox{
.ivu-tabs{
        // overflow:hidden;
        padding-bottom: 20px;
.ivu-tabs-content.ivu-tabs-content-animated{
          // width: 99.3%;
          margin: 0 auto;
        }
      }
    }
</style>

<style scoped>
.sec-title {
  color: var(--ix-text, #e8ebf0);
  font-size: 16px;
  margin: 24px 0 12px;
}
.rep-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.rep-cell {
  min-width: 150px;
  padding: 10px 12px;
  border: 1px solid var(--ix-hairline, rgba(255, 255, 255, 0.09));
  border-radius: 8px;
}
.rep-cell .k {
  display: block;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ix-text-faint, #6b7280);
}
.rep-cell .v {
  display: block;
  margin-top: 4px;
  font-size: 18px;
  color: var(--ix-text, #e8ebf0);
  font-variant-numeric: tabular-nums;
}
.ix-num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>

<script>
/**
 * A COUNTERPARTY'S PROFILE — svc-p2p `reputation.get` and their live offers.
 *
 * `reputation.get` is the one procedure in svc-p2p that takes another user's id
 * as input, and it is scoped `p2p:read`. What it returns is the §6.2 record:
 * trade counts, dispute counts, completion rate, average release time, badges.
 * These are the numbers a taker is entitled to see before trading with someone,
 * and they are the only ones this screen shows.
 *
 * COMPLETION RATE IS THE ONE COMPUTED VALUE, and it is not money. `completionRate`
 * arrives as a plain ratio (`z.number()` in the contract, not an amount string),
 * so rendering it as a percentage is arithmetic on a statistic rather than on a
 * balance. Nothing else on this screen is multiplied.
 *
 * THEIR OFFERS come from the public book, filtered to this maker for the same
 * reason MyAd filters to the caller: `offers.list` has no `makerId` input. The
 * same 200-row caveat applies.
 */
import IxState from "../../components/intafaced/IxState.vue";
import ixModule from "../../components/intafaced/module-mixin.js";
import { query } from "../../config/intafaced.js";

var LIST_LIMIT = 200;

export default {
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      rep: this.emptySection(),
      offers: this.emptySection()
    };
  },
  computed: {
    userId: function () {
      return this.$route.query.id || "";
    },
    theirs: function () {
      var id = this.userId;
      var rows = this.offers.data || [];
      return rows.filter(function (o) {
        return o.makerId === id && o.status === "active";
      });
    },
    /** They sell, the reader buys. */
    theirSells: function () {
      return this.theirs.filter(function (o) { return o.side === "sell"; });
    },
    theirBuys: function () {
      return this.theirs.filter(function (o) { return o.side === "buy"; });
    },
    completionPercent: function () {
      var r = this.rep.data;
      if (!r) return "—";
      // A ratio, not an amount. Shown to one decimal place; with no trades at
      // all it is not "0%" but unknown, and says so.
      if (!r.tradesTotal) return "—";
      return (r.completionRate * 100).toFixed(1) + "%";
    }
  },
  methods: {
    maskUser(id) {
      if (!id) return "—";
      var s = String(id);
      return s.length <= 8 ? s : s.slice(0, 8) + "…";
    }
  },
  created() {
    this.$store.commit("navigate", "nav-otc");
    if (!this.userId) return;
    this.load("rep", query("p2p", "reputation.get", { userId: this.userId }, this.ixToken));
    this.load("offers", query("p2p", "offers.list", { limit: LIST_LIMIT }, this.ixToken));
  }
};
</script>
