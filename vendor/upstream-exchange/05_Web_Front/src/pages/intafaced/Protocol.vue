<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.protocol.title') }}</h1>
      <p>{{ $t('intafaced.modules.protocol.blurb') }}</p>
      <div class="ix-source">svc-protocol · /api/protocol/trpc</div>
    </div>

    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">
      {{ $t('intafaced.modules.protocol.note') }}
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.protocol.healthTitle') }}</h2>
        <span class="ix-sub">health</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.protocol.healthLead') }}
      </p>
      <IxState :loading="health.loading" :reason="health.reason" :message="health.message" endpoint="/api/protocol/trpc/health">
        <div v-if="health.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.protocol.chainId') }}</span>
            <span class="v">{{ health.data.chainId }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.protocol.custodial') }}</span>
            <span class="v">{{ health.data.custodial }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.protocol.relayEnabled') }}</span>
            <span class="v">{{ health.data.relayEnabled }}</span>
          </div>
          <div class="ix-kv-item" v-if="health.data.factoryConfigured !== undefined">
            <span class="k">{{ $t('intafaced.protocol.factoryConfigured') }}</span>
            <span class="v">{{ health.data.factoryConfigured }}</span>
          </div>
        </div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.protocol.chainStatusTitle') }}</h2>
        <span class="ix-sub">chainStatus</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.protocol.chainStatusLead') }}
      </p>
      <IxState :loading="chain.loading" :reason="chain.reason" :message="chain.message" endpoint="/api/protocol/trpc/chainStatus">
        <div v-if="chain.data" class="ix-kv">
          <div class="ix-kv-item" v-for="row in chainRows" :key="row.k">
            <span class="k">{{ row.k }}</span>
            <span class="v">{{ row.v }}</span>
          </div>
        </div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * svc-protocol — smart accounts + launch factory (#210 / #217).
 *
 * Router IS mounted on main. Older copy claimed only /health existed; that is
 * no longer true. This screen reads public procedures only (health, chainStatus)
 * so a visitor sees whether factory/implementation/token-factory are configured
 * and whether the chain is reachable — never a fake "deployed" badge.
 *
 * Launch product UI lives at /launch (same service, launch.status). Account
 * claim / session grant mutations are not drawn: they need chain keys and a
 * product path, not a drive-by shell form.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxProtocol',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      health: this.emptySection(),
      chain: this.emptySection()
    };
  },
  computed: {
    chainRows() {
      var d = this.chain.data;
      if (!d) return [];
      var keys = [
        'reachable',
        'configuredChainId',
        'observedChainId',
        'blockNumber',
        'suiteConfigured',
        'suiteDeployed',
        'tokenFactoryConfigured',
        'tokenFactoryDeployed',
        'usable',
        'launchUsable',
        'refusalCode',
        'reason'
      ];
      var rows = [];
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (d[k] === undefined || d[k] === null) continue;
        rows.push({ k: k, v: d[k] });
      }
      return rows;
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('health', query('protocol', 'health', undefined, this.ixToken));
    this.load('chain', query('protocol', 'chainStatus', undefined, this.ixToken));
  }
};
</script>
