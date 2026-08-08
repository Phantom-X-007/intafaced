<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.pay.paymentsPage.title') }}</h1>
      <p>{{ $t('intafaced.pay.paymentsPage.lead') }}</p>
      <div class="ix-source">svc-pay · payment.list · payment.create · payment.authorize · payment.capture · payment.refund · payment.history</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.pay.nav.aria" />

    <IxState :loading="merchant.loading" :reason="merchant.reason" :message="merchant.message" endpoint="/api/pay/trpc/merchant.me">
      <div v-if="!merchantId" class="ix-note ix-note-quiet">
        {{ $t('intafaced.pay.linksPage.needMerchant') }}
        <div class="ix-actions" style="margin-top:12px;">
          <router-link to="/pay/merchant">
            <Button size="small">{{ $t('intafaced.pay.overview.openMerchant') }}</Button>
          </router-link>
        </div>
      </div>

      <template v-else>
        <!-- ── the payments themselves ────────────────────────────────── -->
        <div class="ix-card">
          <div class="ix-card-head">
            <h2>{{ $t('intafaced.pay.paymentsTitle') }}</h2>
            <span class="ix-sub">payment.list</span>
          </div>

          <div class="ix-form-row" style="margin-bottom:16px;">
            <div class="ix-field">
              <label>{{ $t('intafaced.bank.status') }}</label>
              <Select v-model="statusFilter" @on-change="reloadPayments">
                <Option value="" :label="$t('intafaced.pay.allStatuses')"></Option>
                <Option v-for="s in STATUSES" :key="s" :value="s" :label="s"></Option>
              </Select>
            </div>
            <div class="ix-form-action">
              <Button size="small" @click="reloadPayments">{{ $t('intafaced.state.refresh') }}</Button>
            </div>
          </div>

          <IxState :loading="payments.loading" :reason="payments.reason" :message="payments.message" endpoint="/api/pay/trpc/payment.list">
            <div v-if="payments.data && payments.data.length" class="ix-scroll">
              <table class="ix-table">
                <thead>
                  <tr>
                    <th>{{ $t('intafaced.pay.created') }}</th>
                    <th>{{ $t('intafaced.pay.amount') }}</th>
                    <th>{{ $t('intafaced.pay.asset') }}</th>
                    <th>{{ $t('intafaced.pay.method') }}</th>
                    <th>{{ $t('intafaced.pay.railAdapter') }}</th>
                    <th>{{ $t('intafaced.pay.railRef') }}</th>
                    <th>{{ $t('intafaced.bank.status') }}</th>
                    <th>{{ $t('intafaced.pay.captured') }}</th>
                    <th>{{ $t('intafaced.pay.refunded') }}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in payments.data" :key="p.id">
                    <td>{{ p.createdAt }}</td>
                    <td>{{ p.amount }}</td>
                    <td>{{ p.assetId }}</td>
                    <td>{{ p.method }}</td>
                    <td>{{ p.railAdapter }}</td>
                    <td>{{ p.railRef === null ? '—' : p.railRef }}</td>
                    <td>{{ p.status }}</td>
                    <td>{{ p.capturedAmount }}</td>
                    <td>{{ p.refundedAmount }}</td>
                    <td>
                      <Button size="small" @click="open(p)">{{ $t('intafaced.pay.openPayment') }}</Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.pay.noPayments') }}</div>
          </IxState>
        </div>

        <!-- ── one payment, and the three things you can do to it ──────── -->
        <div v-if="opened" class="ix-card">
          <div class="ix-card-head">
            <h2>{{ $t('intafaced.pay.paymentDetail') }}</h2>
            <span class="ix-sub">payment.authorize · payment.capture · payment.refund</span>
          </div>
          <p class="ix-lead">{{ $t('intafaced.pay.paymentsPage.detailLead') }}</p>

          <div class="ix-kv" style="margin-bottom:18px;">
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.paymentId') }}</span>
              <span class="v" style="font-size:13px;">{{ opened.id }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.amount') }}</span>
              <span class="v">{{ opened.amount }} {{ opened.assetId }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.captured') }}</span>
              <span class="v">{{ opened.capturedAmount }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.refunded') }}</span>
              <span class="v">{{ opened.refundedAmount }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.bank.status') }}</span>
              <span class="v">{{ opened.status }}</span>
            </div>
          </div>

          <div class="ix-field-grid">
            <div class="ix-field">
              <label for="ix-pm-capture">{{ $t('intafaced.pay.captureAmountOptional') }}</label>
              <Input element-id="ix-pm-capture" v-model="captureAmount" :placeholder="$t('intafaced.pay.captureAmountHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-pm-refund">{{ $t('intafaced.pay.refundAmount') }}</label>
              <Input element-id="ix-pm-refund" v-model="refundAmount" :placeholder="$t('intafaced.bank.amountHint')"></Input>
            </div>
          </div>

          <div class="ix-actions">
            <Button :loading="authorized.busy" @click="authorize">{{ $t('intafaced.pay.authorize') }}</Button>
            <Button type="primary" :loading="captured.busy" @click="capture">{{ $t('intafaced.pay.capture') }}</Button>
            <Button :loading="refunded.busy" :disabled="!refundAmount" @click="refund">{{ $t('intafaced.pay.refund') }}</Button>
            <Button size="small" @click="loadHistory">{{ $t('intafaced.pay.history') }}</Button>
          </div>

          <div v-if="authorized.ran" style="margin-top:14px;">
            <div v-if="authorized.reason === 'ok'" class="ix-done">
              <strong>{{ $t('intafaced.pay.authorized') }}</strong>
              <div style="margin-top:6px;">{{ $t('intafaced.bank.status') }}: {{ authorized.data.status }}</div>
            </div>
            <IxState v-else :loading="authorized.busy" :reason="authorized.reason" :message="authorized.message" endpoint="/api/pay/trpc/payment.authorize"></IxState>
          </div>

          <div v-if="captured.ran" style="margin-top:14px;">
            <div v-if="captured.reason === 'ok'" class="ix-done">
              <strong>{{ $t('intafaced.pay.capturedOk') }}</strong>
              <div style="margin-top:6px;">{{ $t('intafaced.pay.captured') }}: {{ captured.data.capturedAmount }}</div>
            </div>
            <IxState v-else :loading="captured.busy" :reason="captured.reason" :message="captured.message" endpoint="/api/pay/trpc/payment.capture"></IxState>
          </div>

          <div v-if="refunded.ran" style="margin-top:14px;">
            <div v-if="refunded.reason === 'ok'" class="ix-done">
              <strong>{{ $t('intafaced.pay.refundedOk') }}</strong>
              <div style="margin-top:6px;">{{ $t('intafaced.pay.refunded') }}: {{ refunded.data.refundedAmount }}</div>
            </div>
            <IxState v-else :loading="refunded.busy" :reason="refunded.reason" :message="refunded.message" endpoint="/api/pay/trpc/payment.refund"></IxState>
          </div>
        </div>

        <!-- ── the append-only log ────────────────────────────────────── -->
        <div v-if="opened && history.reason" class="ix-card">
          <div class="ix-card-head">
            <h2>{{ $t('intafaced.pay.history') }}</h2>
            <span class="ix-sub">payment.history</span>
          </div>
          <p class="ix-lead">{{ $t('intafaced.pay.paymentsPage.historyLead') }}</p>
          <IxState :loading="history.loading" :reason="history.reason" :message="history.message" endpoint="/api/pay/trpc/payment.history">
            <div v-if="history.data && history.data.length" class="ix-scroll">
              <table class="ix-table">
                <thead>
                  <tr>
                    <th>{{ $t('intafaced.pay.at') }}</th>
                    <th>{{ $t('intafaced.pay.event') }}</th>
                    <th>{{ $t('intafaced.pay.railEventId') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="e in history.data" :key="e.id">
                    <td>{{ e.ts }}</td>
                    <td>{{ e.event }}</td>
                    <td>{{ e.railEventId === null ? '—' : e.railEventId }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.pay.noHistory') }}</div>
          </IxState>
        </div>

        <!-- ── take a payment ─────────────────────────────────────────── -->
        <div class="ix-card">
          <div class="ix-card-head">
            <h2>{{ $t('intafaced.pay.newPayment') }}</h2>
            <span class="ix-sub">payment.create</span>
          </div>
          <p class="ix-lead">{{ $t('intafaced.pay.paymentsPage.createLead') }}</p>

          <div class="ix-field-grid">
            <div class="ix-field">
              <label for="ix-np-amount">{{ $t('intafaced.pay.amount') }}</label>
              <Input element-id="ix-np-amount" v-model="form.amount" :placeholder="$t('intafaced.bank.amountHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-np-asset">{{ $t('intafaced.pay.asset') }}</label>
              <Input element-id="ix-np-asset" v-model="form.assetId" :placeholder="$t('intafaced.bank.assetHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-np-method">{{ $t('intafaced.pay.method') }}</label>
              <Input element-id="ix-np-method" v-model="form.method" :placeholder="$t('intafaced.pay.methodHint')"></Input>
            </div>
            <div class="ix-field">
              <label>{{ $t('intafaced.pay.railAdapter') }}</label>
              <Select v-model="form.railAdapter" :placeholder="$t('intafaced.pay.chooseRail')">
                <Option v-for="rail in railIds" :key="rail" :value="rail" :label="rail"></Option>
              </Select>
            </div>
            <div class="ix-field">
              <label for="ix-np-customer">{{ $t('intafaced.pay.customerRefOptional') }}</label>
              <Input element-id="ix-np-customer" v-model="form.customerRef" :placeholder="$t('intafaced.pay.customerRefHint')"></Input>
            </div>
          </div>

          <div class="ix-actions">
            <Button type="primary" :loading="createdPayment.busy" :disabled="!canCreate" @click="submitPayment">
              {{ $t('intafaced.pay.newPayment') }}
            </Button>
          </div>

          <div v-if="createdPayment.ran" style="margin-top:14px;">
            <div v-if="createdPayment.reason === 'ok'" class="ix-done">
              <strong>{{ $t('intafaced.pay.paymentCreated') }}</strong>
              <div style="margin-top:6px;">{{ createdPayment.data.id }} · {{ createdPayment.data.status }}</div>
            </div>
            <IxState v-else :loading="createdPayment.busy" :reason="createdPayment.reason" :message="createdPayment.message" endpoint="/api/pay/trpc/payment.create"></IxState>
          </div>
        </div>
      </template>
    </IxState>
  </div>
</template>

<script>
/**
 * PAYMENTS — svc-pay's `payment` router: the merchant integration path.
 *
 * ── THIS IS THE MERCHANT'S SIDE, NOT THE PAYER'S ──────────────────────────
 * `payment.create` / `authorize` / `capture` are the server-to-server flow a
 * merchant drives against a rail they name. The PAYER's path is the hosted
 * checkout (its own screen), which is public, cannot name a rail, and cannot
 * be told an amount. Keeping them on separate screens is not tidiness: the two
 * differ in exactly the properties that make the public one safe.
 *
 * ── REFUND HAS ITS OWN SCOPE AND ITS OWN BUTTON ───────────────────────────
 * `pay:refund`, not `pay:write` — "refunding is not the same authority as
 * taking payment" — so a session may be able to capture and still be refused a
 * refund. Both are drawn; `IxState` names which scope was denied, and one
 * generic "action failed" would have hidden the distinction the service went
 * out of its way to make.
 *
 * ── EVERY AMOUNT ON THIS SCREEN IS A STRING FROM THE SERVICE ──────────────
 * `amount`, `capturedAmount`, `refundedAmount` are printed exactly as they
 * arrived. Nothing computes "remaining to capture" or "refundable": that is
 * decimal subtraction, this platform does it in the ledger, and a browser's
 * answer would be the one the merchant read and the wrong one.
 *
 * A blank capture amount means "capture the full authorised amount" — the
 * router makes `amount` optional there for exactly that — so the field says
 * optional and the omission is not sent as an empty string.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { PAY_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

/** The statuses svc-pay's `payment.list` will filter on. Not copy — wire values. */
var STATUSES = ['created', 'authorized', 'captured', 'settled', 'refunded', 'disputed', 'failed'];

export default {
  name: 'IxPayPayments',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: PAY_NAV,
      STATUSES: STATUSES,
      statusFilter: '',
      opened: null,
      captureAmount: '',
      refundAmount: '',
      form: { amount: '', assetId: 'USDT', method: '', railAdapter: '', customerRef: '' },
      merchant: this.emptySection(),
      health: this.emptySection(),
      payments: this.emptySection(),
      history: this.emptySection(),
      createdPayment: this.emptyAction(),
      authorized: this.emptyAction(),
      captured: this.emptyAction(),
      refunded: this.emptyAction()
    };
  },
  computed: {
    merchantId() {
      return (this.merchant.data && this.merchant.data.id) || '';
    },
    railIds() {
      return (this.health.data && this.health.data.rails) || [];
    },
    canCreate() {
      return Boolean(this.form.amount && this.form.assetId && this.form.method && this.form.railAdapter);
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    var self = this;
    this.load('health', query('pay', 'health', undefined, this.ixToken));
    this.load('merchant', query('pay', 'merchant.me', undefined, this.ixToken)).then(function(res) {
      if (res.ok && res.data) self.reloadPayments();
    });
  },
  methods: {
    reloadPayments() {
      if (!this.merchantId) return;
      var input = { merchantId: this.merchantId };
      if (this.statusFilter) input.status = this.statusFilter;
      this.load('payments', query('pay', 'payment.list', input, this.ixToken));
    },
    open(payment) {
      this.opened = payment;
      this.history = { loading: false, reason: null, message: '', data: null };
      this.authorized = this.emptyAction();
      this.captured = this.emptyAction();
      this.refunded = this.emptyAction();
    },
    /** Re-read the one payment after a write, so the panel shows the outcome. */
    refreshOpened() {
      var self = this;
      if (!this.opened) return;
      query('pay', 'payment.get', { paymentId: this.opened.id }, this.ixToken).then(function(res) {
        if (res.ok) self.opened = res.data;
        self.reloadPayments();
      });
    },
    authorize() {
      var self = this;
      if (!this.opened) return;
      this.act('authorized', mutate('pay', 'payment.authorize', { paymentId: this.opened.id }, this.ixToken)).then(function(res) {
        if (res.ok) self.refreshOpened();
      });
    },
    capture() {
      var self = this;
      if (!this.opened) return;
      var input = { paymentId: this.opened.id };
      // Omitted, never ''. An absent amount means the full authorised amount.
      if (this.captureAmount) input.amount = this.captureAmount;
      this.act('captured', mutate('pay', 'payment.capture', input, this.ixToken)).then(function(res) {
        if (!res.ok) return;
        self.captureAmount = '';
        self.refreshOpened();
      });
    },
    refund() {
      var self = this;
      if (!this.opened || !this.refundAmount) return;
      this.act(
        'refunded',
        mutate('pay', 'payment.refund', { paymentId: this.opened.id, amount: this.refundAmount }, this.ixToken)
      ).then(function(res) {
        if (!res.ok) return;
        self.refundAmount = '';
        self.refreshOpened();
      });
    },
    loadHistory() {
      if (!this.opened) return;
      this.load('history', query('pay', 'payment.history', { paymentId: this.opened.id }, this.ixToken));
    },
    submitPayment() {
      var self = this;
      if (!this.canCreate || !this.merchantId) return;
      var input = {
        merchantId: this.merchantId,
        amount: this.form.amount,
        assetId: this.form.assetId,
        method: this.form.method,
        railAdapter: this.form.railAdapter
      };
      if (this.form.customerRef) input.customerRef = this.form.customerRef;
      this.act('createdPayment', mutate('pay', 'payment.create', input, this.ixToken)).then(function(res) {
        if (!res.ok) return;
        self.form.amount = '';
        self.reloadPayments();
      });
    }
  }
};
</script>
