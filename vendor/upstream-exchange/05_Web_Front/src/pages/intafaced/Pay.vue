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
        <span class="pay-acquirer-note">No live acquirer implied.</span>
        <details class="bank-details"><summary>Details</summary><code>svc-pay · /api/pay/trpc</code><p>Failed reads are never converted to a zero balance.</p></details>
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

<style scoped>
.pay-overview > .ix-subnav { flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; margin-bottom: 0; }
.pay-overview > .ix-subnav /deep/ .ix-subnav-item { flex: 0 0 auto; min-height: 36px; display: inline-flex; align-items: center; }
.pay-overview .pay-overview-head { gap: 20px; margin-bottom: 0; padding: 16px 0; }
.pay-overview .bank-overline { color: #929292; }
.pay-overview .pay-overview-posture { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.pay-overview .pay-acquirer-note { color: #929292; font-size: 11px; }
.pay-overview .bank-details p { margin-top: 8px; max-width: 300px; color: #929292; font-size: 11px; }
.pay-overview /deep/ .ix-workspace-state { padding: 20px 0; gap: 16px; border-top: 0; }
.pay-overview /deep/ .ix-workspace-marker { flex-basis: 28px; height: 28px; }
.pay-overview /deep/ .ix-workspace-copy h2 { margin: 4px 0 6px; font-size: 18px; }
.pay-overview /deep/ .ix-workspace-actions { margin-top: 10px; }
.pay-overview .pay-workspace-links { grid-template-columns: minmax(0, 1fr); gap: 0; margin-top: 20px; border-top: 1px solid #282828; }
.pay-overview .pay-workspace-links > a { grid-template-columns: 24px minmax(0, 1fr) 16px; align-items: center; gap: 12px; min-height: 56px; padding: 12px; border-top: 0; border-bottom: 1px solid #202020; }
.pay-overview .pay-workspace-links > a > div { display: grid; grid-template-columns: 140px minmax(0, 1fr); align-items: baseline; gap: 12px; }
.pay-overview .pay-workspace-links strong { font-size: 12px; }
.pay-overview .pay-workspace-links p { margin: 0; font-size: 12px; }
.pay-overview .pay-workspace-links a:focus-visible { outline: 2px solid var(--ix-orange); outline-offset: -2px; }
.pay-overview .pay-workspace-links a:hover { background: #0a0a0a; }
@media (max-width: 640px) {
  .pay-overview .pay-overview-head { gap: 12px; padding: 12px 0; }
  .pay-overview .pay-overview-posture { flex-direction: row; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
  .pay-overview .pay-overview-posture .bank-details { flex-basis: 100%; text-align: left; }
  .pay-overview /deep/ .ix-workspace-state { padding: 16px 0; gap: 12px; }
  .pay-overview /deep/ .ix-workspace-copy p { font-size: 12px; }
  .pay-overview .pay-workspace-links { margin-top: 16px; }
  .pay-overview .pay-workspace-links > a { padding: 14px 8px; }
  .pay-overview .pay-workspace-links > a > div { grid-template-columns: minmax(0, 1fr); gap: 4px; }
}
</style>
