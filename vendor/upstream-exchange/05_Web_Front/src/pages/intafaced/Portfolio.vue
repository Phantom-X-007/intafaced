<template>
  <div class="ix-page bank-page platform-module-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.portfolio.title') }}</h1>
      <p>{{ $t('intafaced.portfolio.lead') }}</p>
      <details class="bank-details"><summary>Details</summary><code>svc-ledger · /api/ledger/trpc/portfolio</code></details>
    </div>
    <div class="ix-card">
      <div class="ix-card-head"><h2>{{ $t('intafaced.portfolio.holdings') }}</h2><span class="ix-sub">ledger.balances</span></div>
      <IxState compact :loading="portfolio.loading" :reason="portfolio.reason" :message="portfolio.message" endpoint="/api/ledger/trpc/portfolio">
        <div v-if="portfolio.data && portfolio.data.custodial.length" class="ix-scroll">
          <table class="ix-table">
            <thead><tr><th>{{ $t('intafaced.portfolio.asset') }}</th><th>{{ $t('intafaced.portfolio.amount') }}</th></tr></thead>
            <tbody>
              <tr v-for="holding in portfolio.data.custodial" :key="holding.accountId">
                <td>{{ holding.assetId }}</td>
                <td>{{ holding.amount }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.portfolio.empty') }}</div>
      </IxState>
    </div>

    <div class="ix-card" id="ix-portfolio-indexer">
      <div class="ix-card-head"><h2>{{ $t('intafaced.portfolio.indexer') }}</h2><span class="ix-sub">indexer.positions</span></div>
      <IxState compact :loading="portfolio.loading" :reason="portfolio.reason" :message="portfolio.message" endpoint="/api/ledger/trpc/portfolio">
        <IxState compact
          v-if="indexerAbsent"
          :loading="false"
          reason="no_surface"
          :message="indexerReason"
          endpoint="/api/ledger/trpc/portfolio"
        />
        <div v-else-if="indexerPositions.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.portfolio.market') }}</th>
                <th>{{ $t('intafaced.portfolio.size') }}</th>
                <th>{{ $t('intafaced.portfolio.entryPrice') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in indexerPositions" :key="row.market">
                <td>{{ row.market }}</td>
                <td>{{ row.size }}</td>
                <td>{{ row.entryPrice }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.portfolio.indexerEmpty') }}</div>
      </IxState>
    </div>

    <div class="ix-card" id="ix-portfolio-pnl">
      <div class="ix-card-head"><h2>{{ $t('intafaced.portfolio.pnlTitle') }}</h2><span class="ix-sub">UNAVAILABLE</span></div>
      <p class="ix-note ix-note-quiet" role="status">{{ $t('intafaced.portfolio.pnlRefuse') }}</p>
    </div>

    <div class="ix-card">
      <div class="ix-card-head"><h2>{{ $t('intafaced.tax.title') }}</h2><span class="ix-sub">svc-tax · exportPack</span></div>
      <p class="ix-note ix-note-quiet">{{ $t('intafaced.tax.lead') }}</p>
      <div class="ix-form">
        <label>{{ $t('intafaced.tax.method') }}
          <select id="ix-tax-lot-method" v-model="lotMethod">
            <option value="">{{ $t('intafaced.tax.methodHint') }}</option>
            <option value="FIFO">{{ $t('intafaced.tax.fifo') }}</option>
            <option value="LIFO">{{ $t('intafaced.tax.lifo') }}</option>
            <option value="HIFO">{{ $t('intafaced.tax.hifo') }}</option>
          </select>
        </label>
        <Button type="primary" :loading="taxExport.busy" :disabled="!lotMethod" @click="exportTax">{{ $t('intafaced.tax.exportPack') }}</Button>
      </div>
      <IxState compact v-if="taxPreview.loading || taxPreview.reason" :loading="taxPreview.loading" :reason="taxPreview.reason" :message="taxPreview.message || unmappedCopy" endpoint="/api/tax/trpc/exportPreview">
        <div v-if="taxPreview.data && taxPreview.data.empty" class="ix-note ix-note-quiet">{{ $t('intafaced.tax.empty') }}</div>
      </IxState>
      <IxState compact v-if="taxExport.ran" :loading="taxExport.busy" :reason="taxExport.reason" :message="taxExport.message || unmappedCopy" endpoint="/api/tax/trpc/exportPack">
        <div v-if="taxExport.data && taxExport.data.empty" class="ix-note ix-note-quiet">{{ $t('intafaced.tax.empty') }}</div>
        <div v-else-if="taxExport.data" class="ix-note ix-note-success">{{ $t('intafaced.tax.downloaded') }} · {{ taxExport.data.filename }}</div>
      </IxState>
    </div>
  </div>
</template>
<script>
import IxState from '../../components/intafaced/IxState.vue';
import { query, mutate, subjectOf } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

var UNMAPPED = 'tax.jurisdiction_unmapped';

export default {
  name: 'IxPortfolio',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      portfolio: this.emptySection(),
      taxPreview: { loading: false, reason: null, message: '', data: null },
      taxExport: this.emptyAction(),
      lotMethod: '',
      unmappedCode: UNMAPPED
    };
  },
  computed: {
    unmappedCopy() {
      return this.$t('intafaced.tax.unmapped');
    },
    indexerHalf() {
      return this.portfolio.data && this.portfolio.data.indexer ? this.portfolio.data.indexer : null;
    },
    indexerAbsent() {
      return this.indexerHalf && this.indexerHalf.status === 'absent';
    },
    indexerReason() {
      return this.indexerAbsent ? this.indexerHalf.reason : '';
    },
    indexerPositions() {
      if (!this.indexerHalf || this.indexerHalf.status !== 'present' || !this.indexerHalf.positions) return [];
      return this.indexerHalf.positions;
    }
  },
  watch: {
    lotMethod: function (method) {
      if (!method || !this.ixToken) return;
      this.load('taxPreview', query('tax', 'exportPreview', { lotMethod: method }, this.ixToken));
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    var ownerId = subjectOf(this.ixToken);
    if (ownerId) this.load('portfolio', query('ledger', 'portfolio', { ownerType: 'user', ownerId: ownerId }, this.ixToken));
    else this.load('portfolio', Promise.resolve({ ok: false, reason: 'unauthorized', message: 'No platform session', data: null }));
  },
  methods: {
    exportTax() {
      var self = this;
      if (!this.lotMethod) return;
      this.act('taxExport', mutate('tax', 'exportPack', { lotMethod: this.lotMethod }, this.ixToken)).then(function (res) {
        if (!res.ok || !res.data || !res.data.bodyBase64) return;
        self.downloadPack(res.data);
      });
    },
    downloadPack(data) {
      var bin = atob(data.bodyBase64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var blob = new Blob([bytes], { type: data.mime || 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = data.filename || 'intafaced-tax-export.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  }
};
</script>
