<template>
  <div class="ix-page bank-page platform-module-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.quant.backtest.title') }}</h1>
      <p>{{ $t('intafaced.quant.backtest.lead') }}</p>
      <details class="bank-details"><summary>Details</summary><code>svc-quant · backtest.run</code></details>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.quant.studio.navAria" />

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.quant.backtest.title') }}</h2>
        <span class="ix-sub">backtest.run</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.quant.backtest.runLead') }}</p>
      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-bt-strategy">{{ $t('intafaced.quant.backtest.strategyId') }}</label>
          <Input element-id="ix-bt-strategy" v-model="strategyId" :placeholder="$t('intafaced.quant.backtest.strategyHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-bt-symbol">{{ $t('intafaced.quant.backtest.symbol') }}</label>
          <Input element-id="ix-bt-symbol" v-model="symbol" :placeholder="$t('intafaced.quant.backtest.symbolHint')"></Input>
        </div>
      </div>

      <div class="ix-card-head" style="margin-top:18px;">
        <h2>{{ $t('intafaced.quant.backtest.walkForward') }}</h2>
      </div>
      <p class="ix-lead">{{ $t('intafaced.quant.backtest.walkForwardLead') }}</p>
      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-bt-is-from">{{ $t('intafaced.quant.backtest.inSampleFrom') }}</label>
          <Input element-id="ix-bt-is-from" v-model="walkForward.inSampleFrom"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-bt-is-to">{{ $t('intafaced.quant.backtest.inSampleTo') }}</label>
          <Input element-id="ix-bt-is-to" v-model="walkForward.inSampleTo"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-bt-oos-from">{{ $t('intafaced.quant.backtest.outOfSampleFrom') }}</label>
          <Input element-id="ix-bt-oos-from" v-model="walkForward.outOfSampleFrom"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-bt-oos-to">{{ $t('intafaced.quant.backtest.outOfSampleTo') }}</label>
          <Input element-id="ix-bt-oos-to" v-model="walkForward.outOfSampleTo"></Input>
        </div>
      </div>

      <div class="ix-field" style="margin-top:14px;">
        <label>{{ $t('intafaced.quant.backtest.oosStatus') }}</label>
        <Select v-model="outOfSampleStatus">
          <Option value="passed" :label="$t('intafaced.quant.backtest.oosPassed')"></Option>
          <Option value="failed" :label="$t('intafaced.quant.backtest.oosFailed')"></Option>
          <Option value="inconclusive" :label="$t('intafaced.quant.backtest.oosInconclusive')"></Option>
        </Select>
      </div>

      <div class="ix-card-head" style="margin-top:18px;">
        <h2>{{ $t('intafaced.quant.backtest.costs') }}</h2>
      </div>
      <p class="ix-lead">{{ $t('intafaced.quant.backtest.costsLead') }}</p>
      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-bt-fees">{{ $t('intafaced.quant.backtest.feeSource') }}</label>
          <Input element-id="ix-bt-fees" v-model="feesSource"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-bt-slip">{{ $t('intafaced.quant.backtest.slippageSource') }}</label>
          <Input element-id="ix-bt-slip" v-model="slippageSource"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-bt-lat">{{ $t('intafaced.quant.backtest.latencySource') }}</label>
          <Input element-id="ix-bt-lat" v-model="latencySource"></Input>
        </div>
      </div>

      <div class="ix-actions" style="margin-top:14px;">
        <Button type="primary" :loading="result.busy" :disabled="!strategyId" @click="run">
          {{ $t('intafaced.quant.backtest.run') }}
        </Button>
      </div>
      <div v-if="result.ran" style="margin-top:14px;">
        <div v-if="namedLake" class="ix-note">{{ $t('intafaced.quant.backtest.lakeMissing') }}</div>
        <div v-if="result.reason === 'ok' && result.data" class="ix-done">
          <strong>{{ $t('intafaced.quant.backtest.result') }}</strong>
          <div style="margin-top:6px;">{{ result.data.claimLabel }}</div>
          <div>{{ $t('intafaced.quant.backtest.inSampleNotional') }}: {{ result.data.inSample.notional }}</div>
          <div>{{ $t('intafaced.quant.backtest.outOfSampleNotional') }}: {{ result.data.outOfSample.notional }}</div>
          <div>{{ result.data.outOfSampleLabel }}</div>
        </div>
        <IxState compact v-else :loading="result.busy" :reason="result.reason" :message="result.message" endpoint="/api/quant/trpc/backtest.run">
        </IxState>
      </div>
    </div>
  </div>
</template>
<script>
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { mutate } from '../../../config/intafaced.js';
import { QUANT_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';
export default {
  name: 'IxQuantBacktest',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: QUANT_NAV,
      strategyId: '',
      symbol: 'BTC-USD',
      walkForward: {
        inSampleFrom: '2026-01-01T00:00:00.000Z',
        inSampleTo: '2026-04-01T00:00:00.000Z',
        outOfSampleFrom: '2026-04-01T00:00:00.000Z',
        outOfSampleTo: '2026-07-01T00:00:00.000Z'
      },
      outOfSampleStatus: 'passed',
      feesSource: '',
      slippageSource: '',
      latencySource: '',
      result: this.emptyAction()
    };
  },
  computed: {
    namedLake() {
      const message = this.result.message || '';
      return message.indexOf('quant.backtest_lake_missing') !== -1 || message.indexOf('quant.backtest_fills_missing') !== -1;
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
  },
  methods: {
    run() {
      this.act('result', mutate('quant','backtest.run', {
        strategyId: this.strategyId,
        symbol: this.symbol,
        walkForward: this.walkForward,
        outOfSampleStatus: this.outOfSampleStatus,
        costModel: {
          fees: { kind: 'venue-schedule', source: this.feesSource },
          slippage: { kind: 'order-book-replay', source: this.slippageSource },
          latency: { kind: 'measured-distribution', source: this.latencySource }
        },
        strategyVariantCount: 1
      }, this.ixToken));
    }
  }
};
</script>
