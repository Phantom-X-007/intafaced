<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.chain.title') }}</h1>
      <p>{{ $t('intafaced.modules.chain.blurb') }}</p>
      <div class="ix-source">svc-indexer · no route at svc-edge</div>
    </div>

    <div class="ix-note" style="margin-bottom:20px;">
      <strong>{{ $t('intafaced.reason.not_routed.title') }}</strong>
      <div style="margin-top:6px;">{{ $t('intafaced.modules.chain.note') }}</div>
      <div style="margin-top:8px;">{{ $t('intafaced.reason.not_routed.body') }}</div>
    </div>

    <!-- The call is still made. If someone adds the prefix to svc-edge's route
         table, this screen starts working without anybody editing it — and
         until then it shows the edge's own refusal rather than our summary. -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.modules.chain.title') }}</h2>
        <span class="ix-sub">status</span>
      </div>
      <IxState :loading="status.loading" :reason="status.reason" :message="status.message" endpoint="/api/indexer/trpc/status">
        <div v-if="status.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">chainId</span>
            <span class="v">{{ status.data.chainId }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">indexedHeight</span>
            <span class="v">{{ status.data.indexedHeight === null ? '—' : status.data.indexedHeight }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">finalizedHeight</span>
            <span class="v">{{ status.data.finalizedHeight === null ? '—' : status.data.finalizedHeight }}</span>
          </div>
        </div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.chain.wouldServe') }}</h2>
      </div>
      <div class="ix-tags">
        <span v-for="p in procedures" :key="p" class="ix-tag">{{ p }}</span>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * svc-indexer (§17.5) — running, mounted, and invisible.
 *
 * This is a different failure from svc-protocol's. svc-indexer DOES register
 * its tRPC router and DOES answer on its own port. What it does not have is a
 * `/api/indexer` entry in `services/svc-edge/src/routes.ts`, and svc-edge
 * answers 404 to any prefix it does not recognise rather than forwarding it —
 * deliberately, because an edge that proxies the unknown is a proxy for the
 * whole internal network.
 *
 * So the fix is one line in the edge's route table, and the screen says that
 * instead of implying the chain is not built. The call is still issued on every
 * load so the page tells the truth the moment that line lands.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxChain',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      status: this.emptySection(),
      // From services/svc-indexer/src/router.ts.
      procedures: ['status', 'markets', 'book', 'fills', 'accountFills', 'position', 'positions']
    };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('status', query('indexer', 'status', undefined, this.ixToken));
  }
};
</script>
