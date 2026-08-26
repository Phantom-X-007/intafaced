<template>
  <div class="ix-page bank-page bank-overview">
    <IxSubNav :items="nav" label-key="intafaced.bank.nav.aria" />

    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.bank.title') }}</h1>
      <p>Named ledger spaces, transfers and credit · separate from the Money balance book</p>
      <details class="bank-details">
        <summary>Details</summary>
        <code>svc-bank · /api/bank/trpc</code>
      </details>
    </div>

    <div class="bank-glance">
      <section class="bank-glance-tile">
        <h2>Spaces</h2>
        <IxState compact :loading="spaces.loading" :reason="spaces.reason" :message="spaces.message" endpoint="/api/bank/trpc/spaces.list">
          <div v-if="spaces.data && spaces.data.length">
            <div class="bank-glance-value">{{ spaces.data.length }}</div>
            <div v-for="space in spaces.data.slice(0, 2)" :key="space.id" class="bank-glance-row">
              <span>{{ space.name }} · {{ space.assetId }}</span><strong>{{ space.balance }}</strong>
            </div>
          </div>
          <div v-else class="bank-glance-value">—</div>
        </IxState>
        <p>Named ledger accounts · not the Money balance book</p>
      </section>

      <section class="bank-glance-tile">
        <h2>Unnamed</h2>
        <IxState compact :loading="unnamed.loading" :reason="unnamed.reason" :message="unnamed.message" endpoint="/api/bank/trpc/spaces.unnamed">
          <div v-if="unnamed.data && unnamed.data.length">
            <div v-for="asset in unnamed.data.slice(0, 3)" :key="asset.assetId" class="bank-glance-row bank-glance-row-large">
              <span>{{ asset.assetId }}</span><strong>{{ asset.balance }}</strong>
            </div>
          </div>
          <div v-else class="bank-glance-value">—</div>
        </IxState>
        <p>Cash not assigned to a space · never $0 on error</p>
      </section>

      <section class="bank-glance-tile">
        <h2>Borrow</h2>
        <IxState compact :loading="health.loading" :reason="health.reason" :message="health.message" endpoint="/api/bank/trpc/loans.health">
          <div v-if="health.data" class="bank-glance-value">
            {{ health.data.loans.length ? bps(health.data.portfolioLtvBps) : $t('intafaced.bank.noDebt') }}
          </div>
        </IxState>
        <p>LTV when returned by svc-bank · no invented mark</p>
      </section>
    </div>

    <div class="bank-overview-actions">
      <router-link to="/bank/spaces">Open spaces</router-link>
      <router-link to="/bank/transfers">Transfer</router-link>
      <span>Cards and ramps are simulated until a real issuer or rail exists.</span>
    </div>

    <details class="bank-advanced">
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
import IxState from '../../components/intafaced/IxState.vue';
import IxSubNav from '../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../config/intafaced.js';
import { BANK_NAV } from '../../config/ix-nav.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxBank',
  components: { IxState, IxSubNav },
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
