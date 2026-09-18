<template>
  <div class="ix-page bank-page pay-page pay-overview">
    <IxSubNav :items="nav" label-key="intafaced.pay.nav.aria" />

    <div class="ix-page-head pay-overview-head">
      <div class="pay-overview-title">
        <span class="bank-overline">Payments OS · not a balance book</span>
        <h1>{{ $t('intafaced.modules.pay.title') }}</h1>
        <p>Merchant rails and settlement · not the Money ledger · not Bank spaces</p>
      </div>
      <div class="pay-overview-posture">
        <span class="bank-programme-status">No live payment rails</span>
        <details class="bank-details"><summary>Details</summary><code>svc-pay · /api/pay/trpc</code></details>
      </div>
    </div>

    <IxWorkspace :sections="{ health, merchant, railHealth }" label="Pay">
    <div class="bank-glance pay-glance">
      <section v-if="health.reason === 'ok'" class="bank-glance-tile pay-glance-tile">
        <h2>Service</h2>
        <IxState compact :loading="health.loading" :reason="health.reason" :message="health.message" endpoint="/api/pay/trpc/health">
          <div v-if="health.data">
            <div class="bank-glance-value">{{ health.data.service }}</div>
            <div class="bank-glance-row"><span>Rails</span><strong>{{ (health.data.rails && health.data.rails.length) ? health.data.rails.join(', ') : $t('intafaced.pay.noRails') }}</strong></div>
          </div>
        </IxState>
        <p>Payment service availability</p>
      </section>

      <section v-if="merchant.reason === 'ok'" class="bank-glance-tile pay-glance-tile">
        <h2>Merchant</h2>
        <IxState compact :loading="merchant.loading" :reason="merchant.reason" :message="merchant.message" endpoint="/api/pay/trpc/merchant.me">
          <div v-if="merchant.data">
            <div class="bank-glance-value">{{ merchant.data.mode }}</div>
            <div class="bank-glance-row"><span>Status</span><strong>{{ merchant.data.status }}</strong></div>
            <div class="bank-glance-row"><span>KYB</span><strong>{{ merchant.data.kybStatus }}</strong></div>
          </div>
          <div v-else class="bank-glance-value">Not onboarded</div>
        </IxState>
        <p>One merchant identity for this platform session</p>
      </section>

      <section v-if="railHealth.reason === 'ok'" class="bank-glance-tile pay-glance-tile">
        <h2>Rail readiness</h2>
        <IxState compact :loading="railHealth.loading" :reason="railHealth.reason" :message="railHealth.message" endpoint="/api/pay/trpc/railHealth">
          <div v-if="railHealth.data && railHealth.data.length">
            <div class="bank-glance-value">{{ railHealth.data.length }} rails</div>
            <div v-for="rail in railHealth.data.slice(0, 3)" :key="rail.id" class="bank-glance-row">
              <span>{{ rail.id }} · {{ rail.mode }}</span><strong>{{ rail.usable && rail.healthy ? 'Ready' : 'Unavailable' }}</strong>
            </div>
          </div>
          <div v-else class="bank-glance-value">—</div>
        </IxState>
        <p>Reported payment rail status</p>
      </section>
    </div>

    <details class="bank-advanced">
      <summary>Fraud review</summary>
      <p class="ix-lead">{{ $t('intafaced.pay.overview.fraudReviewLead') }}</p>
      <div class="ix-field-grid bank-advanced-form">
        <div class="ix-field"><label for="ix-fr-merchant">{{ $t('intafaced.pay.merchantId') }}</label><Input element-id="ix-fr-merchant" v-model="form.merchantId"></Input></div>
        <div class="ix-field"><label for="ix-fr-amount">{{ $t('intafaced.pay.amount') }}</label><Input element-id="ix-fr-amount" v-model="form.amount"></Input></div>
        <div class="ix-field"><label for="ix-fr-asset">{{ $t('intafaced.pay.asset') }}</label><Input element-id="ix-fr-asset" v-model="form.assetId"></Input></div>
        <div class="ix-field"><label for="ix-fr-payment">{{ $t('intafaced.pay.overview.fraudReviewPaymentOptional') }}</label><Input element-id="ix-fr-payment" v-model="form.paymentId"></Input></div>
      </div>
      <div class="ix-note ix-note-quiet">{{ $t('intafaced.pay.overview.fraudReviewIdempotency') }} <code>{{ draftId('fraudReview') }}</code></div>
      <Button size="small" :loading="queued.busy" :disabled="!canEnqueue" @click="enqueueReview">{{ $t('intafaced.pay.overview.fraudReviewEnqueue') }}</Button>
      <IxState v-if="queued.ran && queued.reason !== 'ok'" compact :loading="queued.busy" :reason="queued.reason" :message="queued.message" endpoint="/api/pay/trpc/fraud.enqueueReview"></IxState>
    </details>
    </IxWorkspace>
    <nav class="pay-workspace-links" aria-label="Pay workspaces">
      <router-link to="/pay/merchant"><span>01</span><div><strong>Merchant</strong><p>Your business profile and verification.</p></div><b aria-hidden="true">→</b></router-link>
      <router-link to="/pay/links"><span>02</span><div><strong>Payment links</strong><p>Create and manage your payment links.</p></div><b aria-hidden="true">→</b></router-link>
      <router-link to="/pay/settlements"><span>03</span><div><strong>Settlements</strong><p>Review settlement status and records.</p></div><b aria-hidden="true">→</b></router-link>
    </nav>
  </div>
</template>

<script>
/**
 * Pay glance over svc-pay. Amount inputs remain decimal strings and the page
 * never manufactures an acquirer, rail, provider, balance, or fiat total.
 */
import IxWorkspace from '../../components/intafaced/IxWorkspace.vue';
import IxState from '../../components/intafaced/IxState.vue';
import IxSubNav from '../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../config/intafaced.js';
import { PAY_NAV } from '../../config/ix-nav.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxPay',
  components: { IxWorkspace, IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: PAY_NAV,
      health: this.emptySection(),
      railHealth: this.emptySection(),
      merchant: this.emptySection(),
      form: { merchantId: '', amount: '', assetId: 'USDT', paymentId: '' },
      queued: this.emptyAction()
    };
  },
  computed: {
    canEnqueue() {
      return Boolean(this.form.merchantId && this.form.amount && this.form.assetId && this.draftId('fraudReview'));
    }
  },
  created() {
    var self = this;
    this.$store.commit('navigate', 'nav-platform');
    this.load('health', query('pay', 'health', undefined, this.ixToken));
    this.load('railHealth', query('pay', 'railHealth', undefined, this.ixToken));
    this.load('merchant', query('pay', 'merchant.me', undefined, this.ixToken)).then(function(res) {
      if (res && res.ok && res.data && res.data.id && !self.form.merchantId) self.form.merchantId = res.data.id;
    });
  },
  methods: {
    enqueueReview() {
      var self = this;
      if (!this.canEnqueue) return;
      var id = this.draftId('fraudReview');
      if (!id) return;
      var input = { id: id, merchantId: this.form.merchantId, amount: this.form.amount, assetId: this.form.assetId };
      if (this.form.paymentId) input.paymentId = this.form.paymentId;
      this.act('queued', mutate('pay', 'fraud.enqueueReview', input, this.ixToken)).then(function(res) {
        if (!res.ok) return;
        self.clearDraftId('fraudReview');
        self.form.amount = '';
        self.form.paymentId = '';
      });
    }
  }
};
</script>
