<template>
  <div class="ix-page bank-page bank-overview">
    <div class="ix-page-head">
      <div>
        <span class="bank-overline">Financial OS · Bank space book</span>
        <h1>{{ $t('intafaced.modules.bank.title') }}</h1>
        <p>Organise platform value into named spaces, transfers and credit.</p>
        <p class="bank-book-note">Bank spaces are separate from the Money ledger balance book.</p>
      </div>
      <details class="bank-details">
        <summary>Details</summary>
        <code>svc-bank · /api/bank/trpc</code>
      </details>
    </div>

    <IxWorkspace :sections="{ spaces, unnamed, health, rules }" label="Bank" />

    <section class="bank-door-section" aria-labelledby="bank-tools-heading">
      <div class="bank-section-head">
        <div>
          <span class="bank-overline">BANK OPERATIONS</span>
          <h2 id="bank-tools-heading">Workspace</h2>
        </div>
        <span>Cards and ramps are simulated. No live issuer or payment rail.</span>
      </div>
      <nav class="bank-door-grid" :aria-label="$t('intafaced.bank.nav.aria')">
        <component
          :is="item.to === '/bank' ? 'div' : 'router-link'"
          v-for="(item, index) in nav"
          :key="item.to"
          :to="item.to === '/bank' ? undefined : item.to"
          class="bank-door"
          :class="{ 'is-current': item.to === '/bank' }"
          :aria-current="item.to === '/bank' ? 'page' : false"
        >
          <span class="bank-door-index">{{ doorNumber(index) }}</span>
          <strong>{{ $t(item.labelKey) }}</strong>
          <span>{{ doorBlurb(item) }}</span>
          <b v-if="item.to !== '/bank'" aria-hidden="true">→</b>
        </component>
      </nav>
    </section>

    <div v-if="hasBankData" class="bank-glance">
      <section v-if="spaces.reason === 'ok'" class="bank-glance-tile">
        <h2>Spaces</h2>
        <div v-if="spaces.data && spaces.data.length">
          <div class="bank-glance-value">{{ spaces.data.length }} spaces</div>
          <div v-for="space in spaces.data.slice(0, 2)" :key="space.id" class="bank-glance-row">
            <span>{{ space.name }} · {{ space.assetId }}</span><strong>{{ space.balance }}</strong>
          </div>
        </div>
        <div v-else class="bank-glance-value">—</div>
        <p>Named ledger accounts · not the Money balance book</p>
      </section>

      <section v-if="unnamed.reason === 'ok'" class="bank-glance-tile">
        <h2>Unnamed</h2>
        <div v-if="unnamed.data && unnamed.data.length">
          <div v-for="asset in unnamed.data.slice(0, 3)" :key="asset.assetId" class="bank-glance-row bank-glance-row-large">
            <span>{{ asset.assetId }}</span><strong>{{ asset.balance }}</strong>
          </div>
        </div>
        <div v-else class="bank-glance-value">—</div>
        <p>Cash not assigned to a space · never $0 on error</p>
      </section>

      <section v-if="health.reason === 'ok'" class="bank-glance-tile">
        <h2>Borrow</h2>
        <div v-if="health.data" class="bank-glance-value">
          {{ health.data.loans.length ? bps(health.data.portfolioLtvBps) : $t('intafaced.bank.noDebt') }}
        </div>
        <p>LTV when returned by svc-bank · no invented mark</p>
      </section>
    </div>

    <details v-if="rules.reason === 'ok'" class="bank-advanced">
      <summary>Auto-invest</summary>
      <IxState compact :loading="rules.loading" :reason="rules.reason" :message="rules.message" endpoint="/api/bank/trpc/autoInvest.list">
        <div v-if="rules.data && rules.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead><tr><th>Asset</th><th>Threshold</th><th>Target pool</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="rule in rules.data" :key="rule.id">
                <td>{{ rule.assetId }}</td><td>{{ rule.threshold }}</td><td>{{ rule.targetPoolId }}</td><td>{{ rule.status }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.autoInvest.noRules') }}</div>
      </IxState>
      <div class="ix-field-grid bank-advanced-form">
        <div class="ix-field"><label for="ix-ai-asset">Asset</label><Input element-id="ix-ai-asset" v-model="sweep.assetId"></Input></div>
        <div class="ix-field"><label for="ix-ai-threshold">Threshold</label><Input element-id="ix-ai-threshold" v-model="sweep.threshold"></Input></div>
        <div class="ix-field"><label for="ix-ai-pool">Target pool</label><Input element-id="ix-ai-pool" v-model="sweep.targetPoolId"></Input></div>
      </div>
      <Button size="small" :loading="created.busy" :disabled="!canCreateSweep" @click="submitSweep">Create sweep</Button>
      <IxState v-if="created.ran && created.reason !== 'ok'" compact :loading="created.busy" :reason="created.reason" :message="created.message" endpoint="/api/bank/trpc/autoInvest.createThresholdSweep"></IxState>
    </details>
  </div>
</template>

<script>
/**
 * Bank glance. Amounts are ledger-backed decimal strings and render verbatim.
 * The only arithmetic is formatting the integer basis-point LTV returned by
 * svc-bank; this page never sums assets or manufactures a fiat total.
 */
import IxWorkspace from '../../components/intafaced/IxWorkspace.vue';
import IxState from '../../components/intafaced/IxState.vue';
import { query, mutate } from '../../config/intafaced.js';
import { BANK_NAV } from '../../config/ix-nav.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxBank',
  components: { IxWorkspace, IxState },
  mixins: [ixModule],
  data() {
    return {
      nav: BANK_NAV,
      spaces: this.emptySection(),
      unnamed: this.emptySection(),
      health: this.emptySection(),
      rules: this.emptySection(),
      created: this.emptyAction(),
      sweep: { assetId: '', threshold: '', targetPoolId: '' }
    };
  },
  computed: {
    bankSections() {
      return [this.spaces, this.unnamed, this.health];
    },
    bankLoading() {
      return this.bankSections.some(function(section) { return section.loading; });
    },
    bankFailure() {
      return this.bankSections.find(function(section) { return section.reason && section.reason !== 'ok'; }) || null;
    },
    bankReason() {
      return this.bankFailure ? this.bankFailure.reason : null;
    },
    bankMessage() {
      return this.bankFailure ? this.bankFailure.message : '';
    },
    hasBankData() {
      return this.bankSections.some(function(section) { return section.reason === 'ok'; });
    },
    canCreateSweep() {
      return Boolean(this.sweep.assetId && this.sweep.threshold && this.sweep.targetPoolId);
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('spaces', query('bank', 'spaces.list', {}, this.ixToken));
    this.load('unnamed', query('bank', 'spaces.unnamed', undefined, this.ixToken));
    this.load('health', query('bank', 'loans.health', undefined, this.ixToken));
    this.reloadRules();
  },
  methods: {
    doorNumber(index) {
      return ('0' + (index + 1)).slice(-2);
    },
    doorBlurb(item) {
      if (item.to === '/bank') return 'Session and service status. No balance is inferred here.';
      return this.$t(item.labelKey + 'Blurb');
    },
    /** Basis points are an integer ratio, not money. */
    bps(value) {
      return (value / 100).toFixed(2) + '%';
    },
    reloadRules() {
      this.load('rules', query('bank', 'autoInvest.list', undefined, this.ixToken));
    },
    submitSweep() {
      var self = this;
      if (!this.canCreateSweep) return;
      this.act('created', mutate('bank', 'autoInvest.createThresholdSweep', {
        assetId: this.sweep.assetId,
        threshold: this.sweep.threshold,
        targetPoolId: this.sweep.targetPoolId
      }, this.ixToken)).then(function(res) {
        if (!res.ok) return;
        self.sweep = { assetId: '', threshold: '', targetPoolId: '' };
        self.reloadRules();
      });
    }
  }
};
</script>

<style scoped>
.bank-overview > .ix-page-head { align-items: flex-start; margin-bottom: 0; padding: 16px 0; }
.bank-overview .bank-overline { color: #929292; }
.bank-overview > .ix-workspace { margin-bottom: 20px; }
.bank-overview /deep/ .ix-workspace-state { padding: 20px 0; gap: 16px; border-top: 0; }
.bank-overview /deep/ .ix-workspace-marker { flex-basis: 28px; height: 28px; }
.bank-overview /deep/ .ix-workspace-copy h2 { margin: 4px 0 6px; font-size: 18px; }
.bank-overview /deep/ .ix-workspace-actions { margin-top: 10px; }
.bank-overview .bank-section-head { align-items: center; gap: 12px; margin-bottom: 12px; }
.bank-overview .bank-section-head h2 { margin-top: 4px; font-size: 14px; }
.bank-overview .bank-section-head > span { display: block; color: #929292; line-height: 1.5; }
.bank-overview .bank-door-grid { grid-template-columns: minmax(0, 1fr); gap: 0; border: 0; border-top: 1px solid #282828; background: transparent; }
.bank-overview .bank-door { grid-template-columns: 24px 140px minmax(0, 1fr) 16px; grid-template-rows: auto; align-items: center; gap: 12px; min-height: 44px; padding: 10px 12px; border-bottom: 1px solid #202020; }
.bank-overview .bank-door-index { grid-row: 1; color: #929292; }
.bank-overview .bank-door strong { font-size: 12px; font-weight: 500; letter-spacing: 0; text-transform: none; }
.bank-overview .bank-door > span:last-of-type { grid-column: 3; margin: 0; color: #929292; }
.bank-overview .bank-door b { grid-column: 4; color: #929292; }
.bank-overview .bank-door.is-current { box-shadow: inset 2px 0 #bcbcbc; background: #0a0a0a; }
.bank-overview a.bank-door:focus-visible { outline: 2px solid var(--ix-orange); outline-offset: -2px; }
@media (max-width: 640px) {
  .bank-overview > .ix-page-head { padding: 12px 0; }
  .bank-overview > .ix-workspace { margin-bottom: 16px; }
  .bank-overview /deep/ .ix-workspace-state { padding: 16px 0; gap: 12px; }
  .bank-overview /deep/ .ix-workspace-copy p { font-size: 12px; }
  .bank-overview .bank-section-head { display: block; }
  .bank-overview .bank-section-head > span { margin-top: 8px; text-align: left; }
  .bank-overview .bank-door { grid-template-columns: 20px minmax(0, 1fr) 16px; min-height: 44px; padding: 10px 8px; }
  .bank-overview .bank-door b { grid-column: 3; }
}
</style>
