<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.dex.title') }}</h1>
      <p>{{ $t('intafaced.modules.dex.blurb') }}</p>
      <div class="ix-source">svc-dex · /api/dex/trpc · Protocol Plane</div>
    </div>

    <div class="ix-note" style="margin-bottom:20px;">
      <strong>{{ $t('intafaced.dex.planeTitle') }}</strong>
      <div style="margin-top:6px;">{{ $t('intafaced.dex.planeLead') }}</div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
        <router-link to="/exchange/btc_usdt">
          <Button size="small">{{ $t('intafaced.dex.toCex') }}</Button>
        </router-link>
        <router-link to="/protocol">
          <Button size="small">{{ $t('intafaced.dex.toProtocol') }}</Button>
        </router-link>
      </div>
    </div>

    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">
      {{ $t('intafaced.modules.dex.note') }}
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
      <p class="ix-note ix-note-quiet" style="margin-top:12px;">
        {{ $t('intafaced.dex.quoteNoForm') }}
      </p>
    </div>
  </div>
</template>

<script>
/**
 * svc-dex — Protocol Plane front door (N6 plane honesty).
 *
 * CEX terminal is /exchange/* (custodial venue shell). This page is protocol
 * DEX: health says custodial:false. Quote arithmetic exists but needs venue
 * quote inputs the platform does not supply — described, not faked as a book.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';
import ixTrade from '../../assets/js/ix-trade.js';

export default {
  name: 'IxDex',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return { health: this.emptySection() };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    /* custodial:true must never paint — wire.dexHealth requires literal false. */
    this.load(
      'health',
      query('dex', 'health', undefined, this.ixToken),
      ixTrade.schemas.dexHealth
    );
  }
};
</script>
