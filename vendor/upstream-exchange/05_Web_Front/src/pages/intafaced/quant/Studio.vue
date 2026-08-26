<template>
  <div class="ix-page bank-page platform-module-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.quant.studio.title') }}</h1>
      <p>{{ $t('intafaced.quant.studio.lead') }}</p>
      <details class="bank-details"><summary>Details</summary><code>svc-quant · studio.save · sandbox.run</code></details>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.quant.studio.navAria" />

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.quant.studio.title') }}</h2>
        <span class="ix-sub">studio.save</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.quant.studio.builderLead') }}</p>
      <div class="ix-field">
        <label for="ix-studio-name">{{ $t('intafaced.quant.studio.name') }}</label>
        <Input element-id="ix-studio-name" v-model="name" :placeholder="$t('intafaced.quant.studio.nameHint')"></Input>
      </div>
      <div class="ix-field" style="margin-top:14px;">
        <label for="ix-studio-cash">{{ $t('intafaced.quant.studio.cash') }}</label>
        <Input element-id="ix-studio-cash" v-model="cash" :placeholder="$t('intafaced.quant.studio.cashHint')"></Input>
      </div>

      <div class="ix-card-head" style="margin-top:18px;">
        <h2>{{ $t('intafaced.quant.studio.blocks') }}</h2>
      </div>
      <div v-for="(block, i) in blocks" :key="i" class="ix-field-grid" style="margin-top:10px;">
        <div class="ix-field">
          <label>{{ $t('intafaced.quant.studio.side') }}</label>
          <Select v-model="block.side">
            <Option value="buy" :label="$t('intafaced.quant.studio.buy')"></Option>
            <Option value="sell" :label="$t('intafaced.quant.studio.sell')"></Option>
          </Select>
        </div>
        <div class="ix-field">
          <label>{{ $t('intafaced.quant.studio.symbol') }}</label>
          <Input v-model="block.symbol" :placeholder="$t('intafaced.quant.studio.symbolHint')"></Input>
        </div>
        <div class="ix-field">
          <label>{{ $t('intafaced.quant.studio.qty') }}</label>
          <Input v-model="block.qty" :placeholder="$t('intafaced.quant.studio.qtyHint')"></Input>
        </div>
      </div>
      <div class="ix-actions" style="margin-top:10px;">
        <Button size="small" @click="addBlock">{{ $t('intafaced.quant.studio.addBlock') }}</Button>
        <Button size="small" :disabled="blocks.length < 2" @click="removeBlock">{{ $t('intafaced.quant.studio.removeBlock') }}</Button>
      </div>

      <div class="ix-card-head" style="margin-top:18px;">
        <h2>{{ $t('intafaced.quant.studio.risk') }}</h2>
        <span class="ix-sub">studio.save</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.quant.studio.riskLead') }}</p>
      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-studio-dd">{{ $t('intafaced.quant.studio.maxDrawdown') }}</label>
          <Input element-id="ix-studio-dd" v-model="risk.maxDrawdown" :placeholder="$t('intafaced.quant.studio.decimalHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-studio-notional">{{ $t('intafaced.quant.studio.maxNotional') }}</label>
          <Input element-id="ix-studio-notional" v-model="risk.maxNotional" :placeholder="$t('intafaced.quant.studio.decimalHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-studio-kill">{{ $t('intafaced.quant.studio.kill') }}</label>
          <Input element-id="ix-studio-kill" v-model="risk.kill" :placeholder="$t('intafaced.quant.studio.decimalHint')"></Input>
        </div>
      </div>

      <div class="ix-actions" style="margin-top:14px;">
        <Button type="primary" :loading="saved.busy || result.busy" :disabled="!name" @click="saveAndRun">
          {{ $t('intafaced.quant.studio.save') }}
        </Button>
      </div>
      <div v-if="saved.ran" style="margin-top:14px;">
        <div v-if="namedRisk" class="ix-note">{{ $t('intafaced.quant.studio.riskRequired') }}</div>
        <IxState compact :loading="saved.busy" :reason="saved.reason" :message="saved.message" endpoint="/api/quant/trpc/studio.save">
          <div v-if="saved.data" class="ix-done">
            <strong>{{ $t('intafaced.quant.studio.saved') }}</strong>
            <div style="margin-top:6px;">{{ saved.data.name }}</div>
          </div>
        </IxState>
      </div>
      <div v-if="result.ran" style="margin-top:14px;">
        <div v-if="result.reason === 'ok' && result.data && result.data.pnl" class="ix-done">
          <strong>{{ $t('intafaced.quant.studio.result') }}</strong>
          <span class="ix-sub">{{ $t('intafaced.quant.studio.run') }}</span>
          <div style="margin-top:6px;">{{ $t('intafaced.quant.studio.pnl') }}: {{ result.data.pnl }}</div>
          <div>{{ $t('intafaced.quant.studio.cash') }}: {{ result.data.cash }}</div>
        </div>
        <IxState compact v-else :loading="result.busy" :reason="result.reason" :message="result.message" endpoint="/api/quant/trpc/sandbox.run">
        </IxState>
      </div>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.quant.studio.savedList') }}</h2>
        <span class="ix-sub">studio.list</span>
      </div>
      <IxState compact :loading="listed.loading" :reason="listed.reason" :message="listed.message" endpoint="/api/quant/trpc/studio.list">
        <div v-if="listed.data && listed.data.strategies && listed.data.strategies.length" class="ix-kv">
          <div v-for="row in listed.data.strategies" :key="row.id" class="ix-kv-item">
            <span class="k">{{ row.name }}</span>
            <span class="v">{{ row.risk.maxDrawdown }} · {{ row.risk.maxNotional }} · {{ row.risk.kill }}</span>
          </div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.quant.studio.noStrategies') }}</div>
      </IxState>
    </div>
  </div>
</template>
<script>
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { QUANT_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';
export default {
  name: 'IxQuantStudio',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: QUANT_NAV,
      name: '',
      cash: '10000',
      blocks: [{ side: 'buy', symbol: 'BTC-USD', qty: '0.01' }],
      risk: { maxDrawdown: '', maxNotional: '', kill: '' },
      saved: this.emptyAction(),
      result: this.emptyAction(),
      listed: this.emptySection()
    };
  },
  computed: {
    namedRisk() {
      return !!(this.saved.message && this.saved.message.indexOf('quant.studio_risk_block_required') !== -1);
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.loadList();
  },
  methods: {
    loadList() {
      this.load('listed', query('quant', 'studio.list', undefined, this.ixToken));
    },
    addBlock() {
      this.blocks.push({ side: 'buy', symbol: 'BTC-USD', qty: '0.01' });
    },
    removeBlock() {
      if (this.blocks.length > 1) this.blocks.pop();
    },
    saveAndRun() {
      var self = this;
      this.act('saved', mutate('quant','studio.save', {
        name: this.name,
        blocks: this.blocks,
        risk: {
          maxDrawdown: this.risk.maxDrawdown,
          maxNotional: this.risk.maxNotional,
          kill: this.risk.kill
        },
        cash: this.cash
      }, this.ixToken)).then(function (res) {
        self.loadList();
        if (res && res.ok && res.data && res.data.source) {
          self.act('result', mutate('quant', 'sandbox.run', {
            language: res.data.language,
            source: res.data.source,
            cash: self.cash
          }, self.ixToken));
        }
      });
    }
  }
};
</script>
