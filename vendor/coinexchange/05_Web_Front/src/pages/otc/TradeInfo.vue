<template>
  <div class="content-wrap">
    <div class="container" id="List">
      <IxState
        :loading="offer.loading"
        :reason="offer.reason"
        :message="offer.message"
        endpoint="/api/p2p/trpc/offers.get"
      >
        <Row v-if="o">
          <Col span="6">
          <div class="leftmenu left-box">
            <div class="user-info">
              <div class="avatar-box">
                <div class="user-face user-avatar-public">
                  <span class="user-avatar-in">{{ initial }}</span>
                </div>
                <div class="user-name"></div>
              </div>
              <span class="ml10" style="width: 105px;">{{ maskMaker(o.makerId) }}</span>
            </div>

            <!--
              The vendor showed three verification badges here — email, phone,
              ID — read off its own member record. svc-p2p exposes no
              verification state for a counterparty, and svc-identity's KYC
              status procedure is self-only by design (§10: it will not tell you
              about somebody else). Rendering three grey "unverified" icons for
              every maker would have been asserting something we have not
              checked, so the badges are gone and the reputation block below is
              what replaces them — and unlike the badges, it is real.
            -->
            <div class="deal-user-trade-info">
              <IxState
                :loading="rep.loading"
                :reason="rep.reason"
                :message="rep.message"
                endpoint="/api/p2p/trpc/reputation.get"
              >
                <div v-if="rep.data">
                  <p>{{ $t('otc.tradeinfo.exchangetimes') }}:
                    <em class="trade-times">{{ rep.data.tradesTotal }}</em>
                  </p>
                  <p>{{ $t('otc.rep.completed') }}: <em>{{ rep.data.completed }}</em></p>
                  <p>{{ $t('otc.rep.cancelled') }}: <em>{{ rep.data.cancelled }}</em></p>
                  <p>{{ $t('otc.rep.disputed') }}: <em>{{ rep.data.disputed }}</em></p>
                  <p v-if="rep.data.avgReleaseSecs > 0">
                    {{ $t('otc.rep.avgRelease') }}: <em>{{ rep.data.avgReleaseSecs }}s</em>
                  </p>
                </div>
              </IxState>
            </div>
          </div>
          </Col>
          <Col span="18">
          <div class="right-safe">
            <div class="trade-right-box">
              <div class="trade-price">
                <p>
                  <label>{{ $t('otc.tradeinfo.price') }}</label>
                  <span class="ix-num">{{ o.price }} {{ o.fiatCurrency }} / {{ o.asset }}</span>
                </p>
                <p>
                  <label>{{ $t('otc.priceType') }}</label>
                  <span>{{ o.priceType }}</span>
                </p>
                <p>
                  <label>{{ $t('otc.tradeinfo.num') }}</label>
                  <span class="ix-num">{{ o.remainingAmount }} {{ o.asset }}</span>
                </p>
                <p>
                  <label>{{ $t('otc.tradeinfo.paymethod') }}</label>
                  <span>{{ methodsLabel }}</span>
                </p>
                <p>
                  <label>{{ $t('otc.tradeinfo.exchangelimitamount') }}</label>
                  <span class="ix-num">{{ o.minAmount }} – {{ o.maxAmount }} {{ o.asset }}</span>
                </p>
                <p>
                  <label>{{ $t('otc.side') }}</label>
                  <span>{{ readerAction }}</span>
                </p>
              </div>

              <div class="trade-operation">
                <div class="trade-price-input">
                  <p class="price-input-list">
                    <Input v-model="amount" size="large" :placeholder="$t('otc.tradeinfo.numtip')" style="width: 420px">
                    <span slot="prepend">{{ o.asset }}</span>
                    </Input>
                  </p>
                  <p v-if="methodChoices.length > 1" class="price-input-list" style="margin-top:10px;">
                    <Select v-model="method" size="large" style="width: 420px">
                      <Option v-for="m in methodChoices" :key="m" :value="m">{{ m }}</Option>
                    </Select>
                  </p>
                </div>

                <!--
                  NO CONVERTED TOTAL, ON PURPOSE.

                  The vendor had two linked inputs and multiplied between them
                  with `mul`/`div`/`round` helpers built on JS numbers — the
                  exact thing the money rules forbid, on the fiat leg, where a
                  rounding error is a payment the counterparty can refuse.

                  svc-p2p computes `fiatAmount` from `Amount` (scaled bigint)
                  and returns it as a decimal string on the trade. So the amount
                  is entered once, in the asset, and the fiat figure is read
                  back from the service rather than guessed at here. The line
                  below says that rather than leaving a reader wondering where
                  the total went.
                -->
                <p class="ix-fiat-note">{{ $t('otc.tradeinfo.fiatComputed') }}</p>

                <p v-if="takeError" class="ix-empty ix-empty-error" role="alert">{{ takeError }}</p>

                <div class="price-box">
                  <button class="btn-trade-in" @click="submit" :disabled="taking || !amount">
                    {{ taking ? $t('common.loading') : readerAction }}
                  </button>
                </div>
              </div>

              <div class="trade-remark">
                <h5 class="titles">
                  <span>{{ $t('otc.tradeinfo.remarktitle') }}</span>
                </h5>
                <p class="content">{{ o.terms || $t('otc.noTerms') }}</p>
                <h5 class="titles">
                  <span>{{ $t('otc.tradeinfo.exchangetitle') }}</span>
                </h5>
                <div class="content">
                  <p>{{ $t('otc.tradeinfo.escrow_tip1') }}</p>
                  <p>{{ $t('otc.tradeinfo.escrow_tip2') }}</p>
                  <p>{{ $t('otc.tradeinfo.escrow_tip3') }}</p>
                </div>
              </div>
            </div>
          </div>
          </Col>
        </Row>
      </IxState>
    </div>
  </div>
</template>

<style scoped>
/* right */

.trade-right-box {
  margin-left: 20px;
  text-align: left;
}

.trade-right-box.trade-price {
  padding: 36px;
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

.boxinput.ivu-input {
  border: none;
  background-color: transparent;
  outline: none;
  padding: 10px;
  display: inline-block;
  width: 300px;
}

.trade-right-box.trade-operation.trade-price-input.exchange1 {
  width: 10%;
  text-align: center;
  font-size: 24px;
}

.trade-right-box.trade-operation.text-inputs {
  background-color: #000000;
  border: 1px solid #141414;
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
  border: 1px solid #141414;
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
  color: #1ad4bc;
  font-weight: bolder;
}

.trade-right-box.trade-operation.price-box.btn-trade-in {
  outline: medium;
  border: 0;
  color: white;
  padding: 14px 20px;
  background-color: #1ad4bc;
  cursor: pointer;
  width: 20%;
  text-align: center;
  font-size: 20px;
}

.trade-right-box.trade-remark {
  /* background-color: white; */
  border: 1px solid #141414;
  padding: 30px 36px;
  /* margin-bottom: 30px; */
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

.content-wrap {
  /* background: #f5f5f5; */
  min-height: 600px;
  padding-top: 80px;
}

.container {
  width: 85%;
  margin: 0 auto;
  min-width: 1200px;
  background: #000000;
  color: #fff;
  margin-bottom: 20px;
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
  background: #fff;
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

<style scoped>
.ix-num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ix-fiat-note {
  margin: 12px 0;
  padding: 8px 10px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--ix-text-faint, #6b7280);
  border-left: 2px solid var(--ix-orange, #ff8a1f);
}
</style>

<script>
/**
 * TAKE AN OFFER — svc-p2p `offers.get` + `reputation.get`, then `trades.take`.
 *
 * `trades.take` is the first money path a reader can trigger from this half of
 * the shell: it drives `escrowLock` on the ledger. Three things follow from
 * that, and each is why this screen is shaped the way it is.
 *
 * 1. THE AMOUNT NEVER BECOMES A NUMBER. It is bound as a string, validated with
 *    a regex against the contract's own `amountString` rule, and sent as a
 *    string. The vendor converted between fiat and asset on every keystroke
 *    using float helpers (`mul`, `div`, `round`); that code is gone rather than
 *    corrected, because there is no correct version of it in a JS number. The
 *    fiat leg comes back from the service on the trade.
 *
 * 2. THE OFFER ID COMES FROM THE OFFER. The vendor keyed everything on
 *    `advertiseId` and additionally sent `price` and `coinId` back to the
 *    server from the form — so a tampered form could ask to trade at a price of
 *    its choosing. `trades.take` accepts `{ offerId, amount, method }` and
 *    reads the price from the offer server-side. Nothing about price is sent
 *    from here, and that is a property of the contract worth not undoing.
 *
 * 3. REPUTATION IS REAL AND THE BADGES WERE NOT. `reputation.get` returns
 *    counts svc-p2p actually keeps. The vendor's email/phone/ID badges have no
 *    counterpart for a counterparty in our services, so they are removed rather
 *    than rendered permanently grey.
 *
 * ROUTE PARAM. The list now links `?offerId=`. `?tradeId=` is still accepted
 * because that is what the vendor's own links said, and a bookmarked URL should
 * not silently show an empty screen.
 */
import IxState from "../../components/intafaced/IxState.vue";
import ixModule from "../../components/intafaced/module-mixin.js";
import { query, mutate } from "../../config/intafaced.js";

/** The contract's own rule for an amount on the wire. Kept identical on purpose. */
var AMOUNT_RE = /^\d+(\.\d{1,18})?$/;

export default {
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      offer: this.emptySection(),
      rep: this.emptySection(),
      amount: "",
      method: "",
      taking: false,
      takeError: ""
    };
  },
  computed: {
    o: function () {
      return this.offer.data;
    },
    offerId: function () {
      return this.$route.query.offerId || this.$route.query.tradeId || "";
    },
    /** Method strings the offer states. Empty when it states none. */
    methodChoices: function () {
      var o = this.o;
      if (!o || !o.methods || !o.methods.length) return [];
      var out = [];
      for (var i = 0; i < o.methods.length; i++) {
        var x = o.methods[i];
        if (x == null) continue;
        if (typeof x === "string") out.push(x);
        else {
          var n = x.name || x.method || x.type;
          if (n) out.push(String(n));
        }
      }
      return out;
    },
    methodsLabel: function () {
      return this.methodChoices.length ? this.methodChoices.join(", ") : this.$t("otc.noMethods");
    },
    /** What the READER does, which is the opposite of the maker's side. */
    readerAction: function () {
      if (!this.o) return "";
      return this.o.side === "sell" ? this.$t("otc.buyin") : this.$t("otc.sellout");
    },
    initial: function () {
      var m = this.o && this.o.makerId;
      return m ? String(m).slice(0, 1).toUpperCase() : "?";
    }
  },
  methods: {
    maskMaker(makerId) {
      if (!makerId) return "—";
      var s = String(makerId);
      return s.length <= 8 ? s : s.slice(0, 8) + "…";
    },
    load1() {
      var self = this;
      if (!this.offerId) {
        // No id in the URL is not a service failure, and must not be reported
        // as one.
        this.offer = { loading: false, reason: "error", message: this.$t("otc.tradeinfo.noOfferId"), data: null };
        return;
      }
      this.load("offer", query("p2p", "offers.get", { offerId: this.offerId }, this.ixToken)).then(function (res) {
        if (!res.ok || !res.data) return;
        var choices = self.methodChoices;
        if (choices.length) self.method = choices[0];
        // The maker's record, once we know who the maker is.
        self.load("rep", query("p2p", "reputation.get", { userId: res.data.makerId }, self.ixToken));
      });
    },
    submit() {
      var self = this;
      this.takeError = "";

      if (!AMOUNT_RE.test(this.amount)) {
        this.takeError = this.$t("otc.tradeinfo.amountFormat");
        return;
      }
      // The contract requires a method string. When the offer states none there
      // is nothing legitimate to send, so say so rather than inventing one.
      if (!this.method) {
        this.takeError = this.$t("otc.tradeinfo.noMethodToSend");
        return;
      }

      this.taking = true;
      mutate(
        "p2p",
        "trades.take",
        { offerId: this.offerId, amount: this.amount, method: this.method },
        this.ixToken
      ).then(function (res) {
        self.taking = false;
        if (!res.ok) {
          // Verbatim. svc-p2p distinguishes "offer not active", "below the
          // offer's minimum", "you cannot trade with yourself" and a
          // jurisdiction refusal, and each needs a different reaction.
          self.takeError = res.message;
          return;
        }
        self.$router.push("/chat?tradeId=" + res.data.id);
      });
    }
  },
  created() {
    this.$store.commit("navigate", "nav-otc");
    this.load1();
  }
};
</script>
