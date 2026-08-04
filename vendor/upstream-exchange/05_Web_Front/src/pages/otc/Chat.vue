<template>
  <div class="content-wrap">
    <div class="container chat-in-box" id="List">
      <p style="padding: 10px 0 10px 20px;font-size: 16px;">
        <router-link to="/uc/order" style="color:#00c2a8;">{{ $t('otc.myorder') }}</router-link>
        &gt;<span style="font-size:14px;">{{ $t('otc.chat.orderDetails') }}</span>
      </p>

      <IxState
        :loading="trade.loading"
        :reason="trade.reason"
        :message="trade.message"
        endpoint="/api/p2p/trpc/trades.get"
      >
        <Row class="chat-in" v-if="t">
          <Col span="6">
          <div class="leftmenu left-box chat-right">
            <div class="chat-right-in">
              <h6 class="h6-flex">
                <span>{{ iAmBuyer ? $t('otc.chat.seller') : $t('otc.chat.buyer') }}:</span>
                <router-link :to="{ path: '/checkuser', query: { id: counterpartyId }}">
                  {{ maskUser(counterpartyId) }}
                </router-link>
              </h6>
              <h6>
                <span>{{ $t('otc.chat.exchangeamount') }}:</span>
                <span class="ix-num">{{ t.fiatAmount }}&nbsp;{{ t.fiatCurrency }}</span>
              </h6>

              <div class="mt20">
                <h5>{{ $t('otc.chat.operatetip') }}:</h5>
                <div v-if="iAmBuyer">
                  <p>1, {{ $t('otc.chat.buyerStep1') }}</p>
                  <p>2, {{ $t('otc.chat.buyerStep2') }}</p>
                </div>
                <div v-else>
                  <p>1, {{ $t('otc.chat.sellerStep1') }}</p>
                  <p>2, {{ $t('otc.chat.sellerStep2') }}</p>
                </div>
              </div>

              <div class="bottom-btn">
                <div style="padding-top:20px;">
                  <h6 style="font-weight: 600">{{ $t('otc.chat.orderstatus') }}:
                    <span>{{ statusText }}</span>
                  </h6>

                  <p v-if="actionError" class="ix-empty ix-empty-error" role="alert">{{ actionError }}</p>

                  <!--
                    BUTTONS FOLLOW THE STATE MACHINE, not a status integer.

                    The vendor drove this off `statusBtn` (0/1/2) pushed down a
                    WebSocket, and showed buttons for whichever number arrived
                    last. svc-p2p's states are named — created, escrowed,
                    fiat_sent, released, cancelled, disputed — and each edge has
                    exactly one party who may take it. Deriving the buttons from
                    the state and from which side of the trade the reader is on
                    means an action that the service would refuse is not offered
                    in the first place.
                  -->
                  <div v-if="iAmBuyer && canMarkPaid">
                    <Button type="warning" :loading="acting" @click="confirmMarkPaid = true">
                      {{ $t('otc.chat.orderstatus_1') }}
                    </Button>
                    <Button type="error" :loading="acting" @click="confirmCancel = true">
                      {{ $t('otc.chat.orderstatus_4') }}
                    </Button>
                  </div>

                  <div v-if="!iAmBuyer && canRelease">
                    <Button type="warning" :loading="acting" @click="confirmRelease = true">
                      {{ $t('otc.chat.orderstatus_3') }}
                    </Button>
                  </div>

                  <div v-if="canCancelAsSeller">
                    <Button type="error" :loading="acting" @click="confirmCancel = true">
                      {{ $t('otc.chat.orderstatus_4') }}
                    </Button>
                  </div>

                  <div v-if="canDispute" style="margin-top:8px;">
                    <Button type="error" :loading="acting" @click="disputeOpen = true">
                      {{ $t('otc.chat.orderstatus_5') }}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </Col>

          <Col span="18">
          <div class="rightbox">
            <Row class="chat-top" type="flex" justify="space-between">
              <Col span="4" class="order-time">
              <h5>{{ statusText }}</h5>
              <div v-if="t.deadlineAt" class="reserve-time">{{ $t('otc.chat.deadline') }} {{ t.deadlineAt | dateFormat }}</div>
              </Col>
              <Col span="6" class="order-info">
              <h5>
                <label class="order-name">{{ $t('otc.chat.order') }}</label>
                <span>{{ t.id }}</span>
              </h5>
              </Col>
              <Col span="4" class="order-info">
              <h5 class="ix-num">{{ t.price }}</h5>
              <span>{{ $t('otc.chat.transprice') }} ({{ t.fiatCurrency }})</span>
              </Col>
              <Col span="4" class="order-info">
              <h5 class="ix-num">{{ t.amount }}</h5>
              <span>{{ $t('otc.chat.transnum') }} ({{ t.asset }})</span>
              </Col>
              <Col span="4" class="order-info">
              <h5 class="ix-num">{{ t.fiatAmount }}</h5>
              <span>{{ $t('otc.chat.transmoney') }} ({{ t.fiatCurrency }})</span>
              </Col>
            </Row>

            <!--
              HOW THE BUYER ACTUALLY PAYS — a §13 socket, and the one that most
              needs saying out loud.

              The vendor showed the seller's bank branch and card number, Alipay
              id and WeChat id, with QR codes, read from its own member payment
              records. svc-p2p stores no payment instruments: an offer carries
              `methods` (an unconstrained array naming a rail) and a free-text
              `terms`, and nothing anywhere holds a counterparty's account
              details. So the buyer cannot be told where to send the money.

              This is a functional hole in the flow, not a cosmetic one, and it
              is stated rather than papered over with empty panels — which is
              what the vendor's own `v-else` branches would have rendered, three
              grey boxes reading "not provided", indistinguishable from a seller
              who simply had not filled them in.
            -->
            <div class="pay-socket">
              <IxState reason="no_surface" :message="$t('otc.chat.payDetailsMissing')" />
              <div v-if="t.method" class="pay-method">
                <strong>{{ $t('otc.chat.agreedMethod') }}:</strong> {{ t.method }}
              </div>
            </div>

            <!--
              THE CHAT ITSELF — also a §13 socket.

              The vendor opened a SockJS/STOMP connection to `/chat/chat-webSocket`
              on the Java backend and rendered a message thread. There is no chat
              or messaging service behind our edge; svc-notify carries an in-app
              inbox for notifications, which is a different thing and cannot host
              a two-party conversation. A socket left pointed at a dead host
              retries silently forever and shows an empty thread, which reads as
              "your counterparty has not replied".
            -->
            <div class="chat-socket">
              <IxState reason="no_surface" :message="$t('otc.chat.chatMissing')" />
            </div>
          </div>
          </Col>
        </Row>
      </IxState>
    </div>

    <Modal v-model="confirmMarkPaid" :title="$t('otc.chat.tip')" @on-ok="doMarkPaid">
      <p style="color:red;font-weight: bold;">{{ $t('otc.chat.msg1') }}</p>
    </Modal>

    <Modal v-model="confirmCancel" :title="$t('otc.chat.tip')" @on-ok="doCancel">
      <p style="color:red;font-weight: bold;">{{ $t('otc.chat.msg3') }}</p>
      <Input v-model="cancelReason" :placeholder="$t('otc.chat.cancelReason')" style="margin-top:10px;" />
    </Modal>

    <Modal v-model="confirmRelease" :title="$t('otc.chat.tip')" @on-ok="doRelease">
      <p style="color:red;font-weight: bold;">{{ $t('otc.chat.msg6') }}</p>
    </Modal>

    <Modal v-model="disputeOpen" :title="$t('otc.chat.tip')" @on-ok="doDispute">
      <Form :label-width="80">
        <FormItem :label="$t('otc.chat.compremark')">
          <Input
            v-model="disputeReason"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 5 }"
            :placeholder="$t('otc.chat.disputeReasonTip')"
          ></Input>
        </FormItem>
      </Form>
    </Modal>
  </div>
</template>

<style>
.chat-in.ivu-col.ivu-col-span-4.ivu-poptip-popper{
  margin-top: 35px;
}
.chat-in.ivu-col.ivu-col-span-4.ivu-poptip-title{
  display: none;
}
</style>

<style scoped>

.pop-tel{
  position: absolute;
    top: 50px;
    right: 10px;
    width: 25px;
    height: 25px;
    z-index: 100;
}
.pop-tel img{
  width: 100%;
  height: 100%;
}
.chat-in-box.chat-in.chat-right.chat-right-in h6.h6-flex{
  display: flex;
  overflow: auto;
  min-width:auto;
  white-space:normal;
}
.h6-flex>span{
  flex: 0 0 40px;
}
.h6-flex>a{
  flex: 1 1 100%;
  width: 100%;
}
/* right */
.reserve-time {
  color: #ed3f14;
  font-weight: 700;
}

.rightbox {
  background: #000000;
  margin-left: 20px;
  padding-bottom: 20px;
  margin-bottom: 40px;
}

.chat-top {
  padding: 30px 0;
  font-size: 14px;
}

.order-time h5 {
  font-size: 16px;
  line-height: 40px;
}

.order-info h5 {
  font-weight: 600;
  font-size: 14px;
}
.order-info p a{
  color: #ff6b00;
}
.icons.alipay {
  background-image: url(../../assets/img/alipay.png);
}

.icons.wechat {
  background-image: url(../../assets/img/wechat.png);
}

.icons.qrcode {
  background-image: url(../../assets/images/wechats.png);
}

.icons {
  height: 17px;
  width: 17px;
  display: inline-block;
  margin-top: -1px;
  background-size: 100% 100%;
  vertical-align: middle;
}

.bankfor {
  background-image: url(../../assets/img/bankcard.png);
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
  /* background: white; */
}
/* chat */

/* left */

.mt20 {
  margin-top: 20px;
}

.leftmenu {
  margin-bottom: 60px;
  background-color: #000000;
  position: relative;
  min-height: 1px;
  padding: 50px 15px 50px 15px;
  text-align: left;
}

.chat-in-box.chat-in.chat-right.chat-right-in {
  /* background-color: white; */
}

.chat-in-box.chat-in.chat-right.chat-right-in h6 {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  min-width: 195px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 8px;
}

.chat-in-box.chat-in.chat-right.chat-right-in.seller {
  margin-left: 6px;
}

.chat-in-box.chat-in.chat-right.chat-right-in h6 span {
  margin-left: 6px;
}
.chat-in-box.chat-in.chat-right.chat-right-in h6 a{
  color: #ff6b00;
}
.chat-in-box.chat-in.chat-right.chat-right-in p {
  color: #ccc;
  font-size: 12px;
  margin-bottom: 8px;
  line-height: 1.5;
}

.chat-in-box.chat-in.chat-right.chat-right-in p em {
  color: #f40a0a;
  font-style: normal;
}

/* -- */

.content-wrap {
  /* background: #f5f5f5; */
  min-height: 515px;
}

.container {
  /*padding-top: 30px;*/
  margin: 0 auto;
}
</style>

<style scoped>
.ix-num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.pay-socket,
.chat-socket {
  margin: 16px 20px;
}
.pay-method {
  margin-top: 10px;
  font-size: 13px;
  color: var(--ix-text-dim, #8a909c);
}
.reserve-time {
  font-size: 12px;
  color: var(--ix-text-faint, #6b7280);
}
</style>

<script>
/**
 * THE TRADE DETAIL SCREEN — svc-p2p `trades.get` and the four edges out of it.
 *
 * This is the escrow state machine as a screen. `services/svc-p2p/src/state.ts`
 * is the authority; this renders it and offers only the edges the reader is
 * actually allowed to take:
 *
 *   escrowed   → buyer  `trades.markFiatSent`      (I have paid)
 *   escrowed   → either `trades.cancel`            (refund the seller)
 *   fiat_sent  → seller `trades.confirmReceived`   (release to the buyer)
 *   escrowed / fiat_sent → either `disputes.open`
 *
 * WHY THE BUTTONS ARE DERIVED AND NOT PUSHED. The vendor subscribed to a STOMP
 * topic and set `statusBtn` to whatever integer arrived, then showed buttons for
 * that number. Two failures came free with that design: a dropped socket froze
 * the buttons on a stale state, and the mapping from integer to state lived in
 * the message rather than in the code. Here the state is a name that came back
 * from the service on this request, and every button is a computed property
 * over that name plus which side of the trade the reader is on.
 *
 * NO POLLING, NO SOCKET. There is no live channel to our services from this
 * shell, so after every action the trade is re-read and the screen shows the
 * state the service just confirmed. A reader waiting on a counterparty has to
 * refresh — which is stated, rather than implied by a spinner.
 *
 * MONEY. `amount`, `fiatAmount` and `price` are decimal strings and are printed
 * as they arrive. Nothing is summed, converted or rounded on this screen.
 *
 * WHAT WAS REMOVED AND WHY:
 * - The SockJS/STOMP client (`/chat/chat-webSocket`) and the whole message
 *   thread — no chat service exists behind our edge. §13 socket in the template.
 * - The counterparty's bank / Alipay / WeChat details and QR codes — svc-p2p
 *   stores no payment instruments. §13 socket in the template.
 * - The "fund password" prompt on release. Our release path is
 *   `trades.confirmReceived`, authorised by `p2p:write` on the session; there is
 *   no transaction-password concept in svc-identity, so a field asking for one
 *   would have been theatre.
 */
import IxState from "../../components/intafaced/IxState.vue";
import ixModule from "../../components/intafaced/module-mixin.js";
import { query, mutate, subjectOf } from "../../config/intafaced.js";

export default {
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      trade: this.emptySection(),
      acting: false,
      actionError: "",
      confirmMarkPaid: false,
      confirmCancel: false,
      confirmRelease: false,
      disputeOpen: false,
      cancelReason: "",
      disputeReason: ""
    };
  },
  computed: {
    t: function () {
      return this.trade.data;
    },
    tradeId: function () {
      return this.$route.query.tradeId || "";
    },
    /** Read from the token, not from the trade — the trade names both parties. */
    myId: function () {
      return subjectOf(this.ixToken);
    },
    iAmBuyer: function () {
      return !!(this.t && this.myId && this.t.buyerId === this.myId);
    },
    counterpartyId: function () {
      if (!this.t) return "";
      return this.iAmBuyer ? this.t.sellerId : this.t.buyerId;
    },
    statusText: function () {
      if (!this.t) return "";
      // One key per state name. No integer mapping, so a new state added to the
      // service surfaces as a missing translation rather than as the wrong word.
      return this.$t("otc.chat.state." + this.t.status);
    },
    canMarkPaid: function () {
      return !!(this.t && this.t.status === "escrowed");
    },
    canRelease: function () {
      return !!(this.t && this.t.status === "fiat_sent");
    },
    /** The seller may cancel while escrow is held and the buyer has not paid. */
    canCancelAsSeller: function () {
      return !!(this.t && !this.iAmBuyer && this.t.status === "escrowed");
    },
    canDispute: function () {
      if (!this.t) return false;
      return this.t.status === "escrowed" || this.t.status === "fiat_sent";
    }
  },
  methods: {
    maskUser(id) {
      if (!id) return "—";
      var s = String(id);
      return s.length <= 8 ? s : s.slice(0, 8) + "…";
    },
    getDetail() {
      if (!this.tradeId) {
        this.trade = { loading: false, reason: "error", message: this.$t("otc.chat.noTradeId"), data: null };
        return;
      }
      this.load("trade", query("p2p", "trades.get", { tradeId: this.tradeId }, this.ixToken));
    },
    /**
     * Every mutating action goes through here.
     *
     * Single-flight: `acting` gates re-entry, so a double click cannot send two
     * releases. On success the trade is re-read rather than patched locally —
     * the service decides what state the trade is in, and a screen that guessed
     * would eventually guess wrong.
     */
    act(procedure, input) {
      var self = this;
      if (this.acting) return;
      this.acting = true;
      this.actionError = "";
      mutate("p2p", procedure, input, this.ixToken).then(function (res) {
        self.acting = false;
        if (!res.ok) {
          // CONFLICT here means the trade already moved — a second release, or a
          // cancel after the deadline swept it. Shown as the service worded it.
          self.actionError = res.message;
          return;
        }
        self.getDetail();
      });
    },
    doMarkPaid() {
      this.act("trades.markFiatSent", { tradeId: this.tradeId });
    },
    doRelease() {
      this.act("trades.confirmReceived", { tradeId: this.tradeId });
    },
    doCancel() {
      var input = { tradeId: this.tradeId };
      if (this.cancelReason) input.reason = this.cancelReason;
      this.act("trades.cancel", input);
    },
    doDispute() {
      if (!this.disputeReason) {
        this.actionError = this.$t("otc.chat.disputeReasonRequired");
        return;
      }
      this.act("disputes.open", { tradeId: this.tradeId, reason: this.disputeReason });
    }
  },
  created() {
    this.$store.commit("navigate", "nav-otc");
    this.getDetail();
  }
};
</script>
