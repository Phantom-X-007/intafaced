<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.launch.title') }}</h1>
      <p>{{ $t('intafaced.modules.launch.blurb') }}</p>
      <div class="ix-source">svc-protocol · /api/protocol/trpc/launch.status</div>
    </div>

    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">
      {{ $t('intafaced.modules.launch.note') }}
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.launch.statusTitle') }}</h2>
        <span class="ix-sub">launch.status</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.launch.statusLead') }}
      </p>
      <IxState :loading="status.loading" :reason="status.reason" :message="status.message" endpoint="/api/protocol/trpc/launch.status">
        <div v-if="status.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.launch.usable') }}</span>
            <span class="v">{{ status.data.usable }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.launch.configured') }}</span>
            <span class="v">{{ status.data.configured }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.launch.deployed') }}</span>
            <span class="v">{{ status.data.deployed }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.protocol.chainId') }}</span>
            <span class="v">{{ status.data.chainId }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.launch.factory') }}</span>
            <span class="v">{{ status.data.factory }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.launch.audited') }}</span>
            <span class="v">{{ status.data.template && status.data.template.audited }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.launch.mintAuthority') }}</span>
            <span class="v">{{ status.data.mintAuthorityRetained }}</span>
          </div>
          <div class="ix-kv-item" v-if="status.data.template">
            <span class="k">{{ $t('intafaced.launch.sourceHash') }}</span>
            <span class="v">{{ status.data.template.sourceHash }}</span>
          </div>
          <div class="ix-kv-item" v-if="status.data.refusalCode">
            <span class="k">{{ $t('intafaced.launch.refusal') }}</span>
            <span class="v">{{ status.data.refusalCode }}</span>
          </div>
          <div class="ix-kv-item" v-if="status.data.limits">
            <span class="k">{{ $t('intafaced.launch.maxSupply') }}</span>
            <span class="v">{{ status.data.limits.maxWholeSupply }}</span>
          </div>
        </div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * Token factory status (#217) — read-only honesty surface.
 *
 * Lives under svc-protocol as `launch.status` (public jurisdiction). This page
 * never builds create-token calldata and never signs — it only shows whether a
 * launch is usable, whether the template is audited (always false until a real
 * audit), and that mint authority is retained by nobody.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxLaunch',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return { status: this.emptySection() };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('status', query('protocol', 'launch.status', undefined, this.ixToken));
  }
};
</script>
