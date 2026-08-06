<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.chain.title') }}</h1>
      <p>{{ $t('intafaced.modules.chain.blurb') }}</p>
      <div class="ix-source">svc-indexer · /api/indexer/trpc</div>
    </div>

    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">
      {{ $t('intafaced.modules.chain.note') }}
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.chain.statusTitle') }}</h2>
        <span class="ix-sub">status</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.chain.statusLead') }}
      </p>
      <IxState :loading="status.loading" :reason="status.reason" :message="status.message" endpoint="/api/indexer/trpc/status">
        <div v-if="status.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">chainId</span>
            <span class="v">{{ status.data.chainId }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">chainSource</span>
            <span class="v">{{ status.data.chainSource }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">indexedHeight</span>
            <span class="v">{{ status.data.indexedHeight === null || status.data.indexedHeight === undefined ? '—' : status.data.indexedHeight }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">finalizedHeight</span>
            <span class="v">{{ status.data.finalizedHeight === null || status.data.finalizedHeight === undefined ? '—' : status.data.finalizedHeight }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">behindBy</span>
            <span class="v">{{ status.data.behindBy === null || status.data.behindBy === undefined ? '—' : status.data.behindBy }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">ingestEnabled</span>
            <span class="v">{{ status.data.ingestEnabled }}</span>
          </div>
          <div class="ix-kv-item" v-if="status.data.halted">
            <span class="k">halted</span>
            <span class="v">{{ status.data.halted.reason }}</span>
          </div>
          <div class="ix-kv-item" v-if="status.data.lastError">
            <span class="k">lastError</span>
            <span class="v">{{ status.data.lastError.message }}</span>
          </div>
          <div class="ix-kv-item" v-if="status.data.chain">
            <span class="k">chain.reachable</span>
            <span class="v">{{ status.data.chain.reachable }}</span>
          </div>
          <div class="ix-kv-item" v-if="status.data.chain">
            <span class="k">chain.chainHeight</span>
            <span class="v">{{ status.data.chain.chainHeight === null || status.data.chain.chainHeight === undefined ? '—' : status.data.chain.chainHeight }}</span>
          </div>
        </div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * svc-indexer read models (#218) — status is public jurisdiction.
 *
 * Edge route `/api/indexer` exists on main. Older shell copy claimed the edge
 * had no prefix; that is no longer true. This screen still never invents a
 * height: null stays "—", and halted / lastError surface when present.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxChain',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return { status: this.emptySection() };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('status', query('indexer', 'status', undefined, this.ixToken));
  }
};
</script>
