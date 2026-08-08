<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.pay.checkoutPage.title') }}</h1>
      <p>{{ $t('intafaced.pay.checkoutPage.lead') }}</p>
      <div class="ix-source">svc-pay · resolveLink · checkout.open · checkout.status</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.pay.nav.aria" />

    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">
      <strong>{{ $t('intafaced.pay.checkoutPage.publicTitle') }}</strong>
      <div style="margin-top:6px;">{{ $t('intafaced.pay.checkoutPage.publicBody') }}</div>
    </div>

    <!-- ── what a link says it is, before anybody pays ───────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.resolveTitle') }}</h2>
        <span class="ix-sub">resolveLink</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.checkoutPage.resolveLead') }}</p>

      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-co-token">{{ $t('intafaced.pay.linkToken') }}</label>
          <Input element-id="ix-co-token" v-model="token" :placeholder="$t('intafaced.pay.linkTokenHint')" @on-enter="resolve"></Input>
        </div>
        <div class="ix-form-action">
          <Button type="primary" :disabled="!token" @click="resolve">{{ $t('intafaced.pay.resolve') }}</Button>
        </div>
      </div>

      <IxState v-if="link.reason" :loading="link.loading" :reason="link.reason" :message="link.message" endpoint="/api/pay/trpc/resolveLink">
        <div v-if="link.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.pay.linkLabel') }}</span>
            <span class="v" style="font-size:15px;">{{ link.data.label }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.pay.amount') }}</span>
            <span class="v">{{ link.data.amount === null ? $t('intafaced.pay.payerChooses') : link.data.amount }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.pay.currency') }}</span>
            <span class="v">{{ link.data.currency === null ? $t('intafaced.pay.payerChooses') : link.data.currency }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.pay.expiresAt') }}</span>
            <span class="v">{{ link.data.expiresAt === null ? '—' : link.data.expiresAt }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.pay.remainingUses') }}</span>
            <span class="v">{{ link.data.remainingUses === null ? $t('intafaced.pay.unbounded') : link.data.remainingUses }}</span>
          </div>
        </div>
      </IxState>
    </div>

    <!-- ── open a session against it ─────────────────────────────────────── -->
    <div v-if="link.data" class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.openCheckout') }}</h2>
        <span class="ix-sub">checkout.open</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.checkoutPage.openLead') }}</p>

      <!-- The amount box exists ONLY when the link fixes no amount. On a fixed
           link the service ignores the input outright, so offering a box would
           invite somebody to type a number that is discarded without comment. -->
      <div v-if="link.data.amount === null" class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-co-amount">{{ $t('intafaced.pay.amount') }}</label>
          <Input element-id="ix-co-amount" v-model="payAmount" :placeholder="$t('intafaced.bank.amountHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-co-asset">{{ $t('intafaced.pay.asset') }}</label>
          <Input element-id="ix-co-asset" v-model="payAsset" :placeholder="$t('intafaced.bank.assetHint')"></Input>
        </div>
      </div>
      <div v-else class="ix-note ix-note-quiet" style="margin-bottom:14px;">
        {{ $t('intafaced.pay.checkoutPage.fixedAmount') }}
      </div>

      <div class="ix-actions">
        <Button type="primary" :loading="session.busy" @click="openSession">{{ $t('intafaced.pay.openCheckout') }}</Button>
      </div>

      <div v-if="session.ran" style="margin-top:14px;">
        <div v-if="session.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.pay.sessionOpened') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.pay.sessionToken') }}</div>
          <div style="margin-top:6px;"><code>{{ session.data.sessionToken }}</code></div>
        </div>
        <IxState v-else :loading="session.busy" :reason="session.reason" :message="session.message" endpoint="/api/pay/trpc/checkout.open"></IxState>
      </div>
    </div>

    <!-- ── how to pay, and whether it landed ─────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.sessionTitle') }}</h2>
        <span class="ix-sub">checkout.status</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.checkoutPage.statusLead') }}</p>

      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-co-session">{{ $t('intafaced.pay.sessionToken') }}</label>
          <Input element-id="ix-co-session" v-model="sessionToken" :placeholder="$t('intafaced.pay.sessionTokenHint')" @on-enter="checkStatus"></Input>
        </div>
        <div class="ix-form-action">
          <Button :disabled="!sessionToken" @click="checkStatus">{{ $t('intafaced.state.refresh') }}</Button>
        </div>
      </div>

      <IxState v-if="status.reason" :loading="status.loading" :reason="status.reason" :message="status.message" endpoint="/api/pay/trpc/checkout.status">
        <div v-if="status.data">
          <div class="ix-kv">
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.linkLabel') }}</span>
              <span class="v" style="font-size:15px;">{{ status.data.label }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.amount') }}</span>
              <span class="v">{{ status.data.amount }} {{ status.data.currency }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.method') }}</span>
              <span class="v">{{ status.data.method }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.bank.status') }}</span>
              <span class="v">{{ status.data.status }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.expiresAt') }}</span>
              <span class="v">{{ status.data.expiresAt }}</span>
            </div>
          </div>

          <!-- The instruction is what the payer acts on. It is null until the
               rail has issued one, and an absent instruction is stated rather
               than drawn as an empty box a payer might copy from. -->
          <div style="margin-top:20px;">
            <h3 class="ix-subhead">{{ $t('intafaced.pay.instruction') }}</h3>
            <div v-if="status.data.instruction" class="ix-kv">
              <div class="ix-kv-item">
                <span class="k">{{ $t('intafaced.pay.reference') }}</span>
                <span class="v" style="font-size:13px;">{{ status.data.instruction.reference }}</span>
              </div>
              <div class="ix-kv-item">
                <span class="k">{{ $t('intafaced.pay.payExactly') }}</span>
                <span class="v">{{ status.data.instruction.amount }} {{ status.data.instruction.currency }}</span>
              </div>
            </div>
            <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.pay.noInstruction') }}</div>
          </div>
        </div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * HOSTED CHECKOUT — svc-pay's three PUBLIC procedures, from the payer's seat.
 *
 * ── NO TOKEN IS SENT ON ANY CALL HERE ─────────────────────────────────────
 * `resolveLink`, `checkout.open` and `checkout.status` are `publicProcedure`
 * because a hosted checkout takes money from somebody who is not logged in —
 * that IS what it is. So this screen deliberately does not pass `ixToken`: a
 * signed-in merchant testing their own link must exercise the same anonymous
 * path a customer will, or the test proves nothing about the customer's path.
 *
 * ── THE THREE THINGS THIS SCREEN CANNOT DO, BY DESIGN ─────────────────────
 * It cannot name a rail: the rail is chosen server-side from the deployment's
 * checkout rails, and "a hosted checkout that can name a rail is the route back
 * to the sandbox-withdrawal P0". It cannot set the amount on a fixed-amount
 * link: the service ignores the input outright, so the box is not drawn. And it
 * cannot mark anything paid — only a verified rail webhook can, so the only
 * completion signal here is polling `status`.
 *
 * ── SESSION TOKEN ≠ LINK TOKEN ────────────────────────────────────────────
 * A link is a many-payer capability; a session is one payer's. They are
 * separate fields on this screen because they are separate secrets — using the
 * link token to address a session would let anybody holding the URL read a
 * stranger's checkout, which is exactly why the service issues two.
 *
 * Every amount is the decimal string svc-pay sent. Nothing here parses one.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { PAY_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

export default {
  name: 'IxPayCheckout',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: PAY_NAV,
      token: '',
      payAmount: '',
      payAsset: '',
      sessionToken: '',
      link: { loading: false, reason: null, message: '', data: null },
      status: { loading: false, reason: null, message: '', data: null },
      session: this.emptyAction()
    };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
  },
  methods: {
    resolve() {
      var self = this;
      if (!this.token) return;
      this.session = this.emptyAction();
      // No token argument — the payer is anonymous. See the header.
      this.load('link', query('pay', 'resolveLink', { token: this.token })).then(function(res) {
        if (!res.ok) self.link.data = null;
      });
    },
    openSession() {
      var self = this;
      if (!this.token) return;
      var input = { token: this.token };
      // Only ever sent when the link fixes no amount; on a fixed link the
      // service ignores it and this screen does not draw the field at all.
      if (this.link.data && this.link.data.amount === null) {
        if (this.payAmount) input.amount = this.payAmount;
        if (this.payAsset) input.assetId = this.payAsset;
      }
      this.act('session', mutate('pay', 'checkout.open', input)).then(function(res) {
        if (!res.ok) return;
        self.sessionToken = res.data.sessionToken;
        self.checkStatus();
      });
    },
    checkStatus() {
      if (!this.sessionToken) return;
      this.load('status', query('pay', 'checkout.status', { sessionToken: this.sessionToken }));
    }
  }
};
</script>
