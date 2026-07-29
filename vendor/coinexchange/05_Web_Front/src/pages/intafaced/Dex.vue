<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.dex.title') }}</h1>
      <p>{{ $t('intafaced.modules.dex.blurb') }}</p>
      <div class="ix-source">svc-dex · /api/dex/trpc</div>
    </div>

    <div class="ix-note" style="margin-bottom:20px;">
      <strong>{{ $t('intafaced.modules.dex.title') }}</strong>
      <div style="margin-top:6px;">{{ $t('intafaced.modules.dex.note') }}</div>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.dex.healthTitle') }}</h2>
        <span class="ix-sub">health</span>
      </div>
      <IxState :loading="health.loading" :reason="health.reason" :message="health.message" endpoint="/api/dex/trpc/health">
        <div v-if="health.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.modules.dex.title') }}</span>
            <span class="v">{{ health.data.service }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.dex.custodial') }}</span>
            <span class="v">{{ health.data.custodial }}</span>
          </div>
        </div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.dex.quoteTitle') }}</h2>
        <span class="ix-sub">quote</span>
      </div>
      <div class="ix-note ix-note-quiet">
        {{ $t('intafaced.dex.quoteLead') }}
      </div>
    </div>
  </div>
</template>

<script>
/**
 * svc-dex (§8.6, §17.5) — the Protocol Plane's front door.
 *
 * `health` answers, and it answers `custodial: false`, which is the one claim
 * this module exists to make.
 *
 * `quote` is mounted and its routing arithmetic is real, but read its input:
 * it takes the venue quotes as a parameter. It does not go and find them.
 * Nothing in the platform produces that array today — there is no venue
 * adapter, no `svc-connect`, no aggregator feeding it — so a quote form here
 * would be a form where the user supplies the market and we supply the
 * division. That is not a DEX screen, so it is described rather than drawn.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxDex',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return { health: this.emptySection() };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('health', query('dex', 'health', undefined, this.ixToken));
  }
};
</script>
