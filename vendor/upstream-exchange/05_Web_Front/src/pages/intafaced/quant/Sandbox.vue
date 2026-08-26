<template>
  <div class="ix-page bank-page platform-module-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.quant.title') }}</h1>
      <p>{{ $t('intafaced.quant.lead') }}</p>
      <details class="bank-details"><summary>Details</summary><code>svc-quant · sandbox.run · sandbox.capabilities</code></details>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.quant.studio.navAria" />

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.quant.capabilities') }}</h2>
        <span class="ix-sub">sandbox.capabilities</span>
      </div>
      <IxState compact :loading="caps.loading" :reason="caps.reason" :message="caps.message" endpoint="/api/quant/trpc/sandbox.capabilities">
        <div v-if="caps.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.quant.isolate') }}</span>
            <span class="v">{{ caps.data.isolate }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.quant.venue') }}</span>
            <span class="v">{{ caps.data.venueVault === 'unset' ? $t('intafaced.quant.venueUnset') : $t('intafaced.quant.venueTradeOnly') }}</span>
          </div>
        </div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.quant.run') }}</h2>
        <span class="ix-sub">sandbox.run</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.quant.runLead') }}</p>
      <div class="ix-field-grid">
        <div class="ix-field">
          <label>{{ $t('intafaced.quant.language') }}</label>
          <Select v-model="language" :placeholder="$t('intafaced.quant.language')">
            <Option value="javascript" :label="$t('intafaced.quant.javascript')"></Option>
            <Option value="python" :label="$t('intafaced.quant.python')"></Option>
            <Option value="typescript" :label="$t('intafaced.quant.typescript')"></Option>
          </Select>
        </div>
        <div class="ix-field">
          <label for="ix-quant-cash">{{ $t('intafaced.quant.cash') }}</label>
          <Input element-id="ix-quant-cash" v-model="cash" :placeholder="$t('intafaced.quant.cashHint')"></Input>
        </div>
      </div>
      <div class="ix-field" style="margin-top:14px;">
        <label for="ix-quant-source">{{ $t('intafaced.quant.source') }}</label>
        <Input element-id="ix-quant-source" type="textarea" :rows="8" v-model="source" :placeholder="$t('intafaced.quant.sourceHint')"></Input>
      </div>
      <div class="ix-actions">
        <Button type="primary" :loading="result.busy" :disabled="!source" @click="run">
          {{ $t('intafaced.quant.run') }}
        </Button>
      </div>
      <div v-if="result.ran" style="margin-top:14px;">
        <div v-if="result.reason === 'ok' && result.data && result.data.pnl" class="ix-done">
          <strong>{{ $t('intafaced.quant.result') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.quant.pnl') }}: {{ result.data.pnl }}</div>
          <div>{{ $t('intafaced.quant.cash') }}: {{ result.data.cash }}</div>
          <div v-if="result.data.logs && result.data.logs.length" class="ix-note" style="margin-top:8px;">
            <div v-for="(line, i) in result.data.logs" :key="i">{{ line }}</div>
          </div>
        </div>
        <IxState compact v-else :loading="result.busy" :reason="result.reason" :message="result.message" endpoint="/api/quant/trpc/sandbox.run">
          <div v-if="namedUnwired" class="ix-note">{{ $t('intafaced.quant.sandboxUnwired') }}</div>
        </IxState>
      </div>
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
  name: 'IxQuantSandbox',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: QUANT_NAV,
      language: 'javascript',
      cash: '10000',
      source: 'const px = market.last("BTC-USD");\noms.buy("BTC-USD", "0.01");\nconsole.log(px);\nconsole.log(book.cash());\nconsole.log(book.pnl());',
      caps: this.emptySection(),
      result: this.emptyAction()
    };
  },
  computed: {
    namedUnwired() {
      return !!(this.result.message && this.result.message.indexOf('quant.sandbox_unwired') !== -1);
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.loadCaps();
  },
  methods: {
    loadCaps() {
      this.load('caps', query('quant', 'sandbox.capabilities', undefined, this.ixToken));
    },
    run() {
      this.act('result', mutate('quant', 'sandbox.run', { language: this.language, source: this.source, cash: this.cash }, this.ixToken));
    }
  }
};
</script>
