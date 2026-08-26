<template>
  <div class="ix-page bank-page platform-module-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.execution.arb.title') }}</h1>
      <p>{{ $t('intafaced.execution.arb.lead') }}</p>
      <details class="bank-details"><summary>Details</summary><code>svc-execution · execution.oms.arb.scan</code></details>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.execution.arb.scan') }}</h2>
        <span class="ix-sub">execution.oms.arb.scan</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.execution.arb.empty') }}</p>
      <div class="ix-field">
        <label>{{ $t('intafaced.execution.arb.class') }}</label>
        <Select v-model="scanClass" :placeholder="$t('intafaced.execution.arb.class')">
          <Option value="cross-exchange" :label="$t('intafaced.execution.arb.cross')"></Option>
          <Option value="triangular" :label="$t('intafaced.execution.arb.triangular')"></Option>
          <Option value="basis" :label="$t('intafaced.execution.arb.basis')"></Option>
          <Option value="funding" :label="$t('intafaced.execution.arb.funding')"></Option>
        </Select>
      </div>
      <div class="ix-actions">
        <Button type="primary" :loading="scan.busy" @click="runScan">{{ $t('intafaced.execution.arb.scan') }}</Button>
      </div>
      <IxState compact v-if="scan.ran" :loading="scan.busy" :reason="scan.reason" :message="scan.message" endpoint="/api/execution/trpc/execution.oms.arb.scan">
        <div v-if="scan.data && scan.data.refused && scan.data.refused.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.execution.arb.class') }}</th>
                <th>{{ $t('intafaced.execution.arb.reason') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in scan.data.refused" :key="i">
                <td>{{ scanClass }}</td>
                <td>{{ row.reason }} — {{ row.detail }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.execution.arb.empty') }}</div>
      </IxState>
    </div>
  </div>
</template>
<script>
import IxState from '../../../components/intafaced/IxState.vue';
import { mutate } from '../../../config/intafaced.js';
import ixModule from '../../../components/intafaced/module-mixin.js';
export default {
  name: 'IxExecutionArb',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      scanClass: 'triangular',
      scan: this.emptyAction()
    };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
  },
  methods: {
    runScan() {
      this.act(
        'scan',
        mutate(
          'execution',
          'execution.oms.arb.scan',
          {
            symbol: 'BTC/USDT',
            amount: '1',
            scanClass: this.scanClass,
            quotes: [],
            costTermsByVenue: {},
            inventory: { prePositionedByVenue: {} },
            nowMs: 0,
            maxQuoteAgeMs: null,
            fundingRate: null
          },
          this.ixToken
        )
      );
    }
  }
};
</script>
