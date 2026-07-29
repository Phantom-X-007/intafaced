<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.protocol.title') }}</h1>
      <p>{{ $t('intafaced.modules.protocol.blurb') }}</p>
      <div class="ix-source">svc-protocol · /api/protocol</div>
    </div>

    <div class="ix-note" style="margin-bottom:20px;">
      <strong>{{ $t('intafaced.modules.protocol.title') }}</strong>
      <div style="margin-top:6px;">{{ $t('intafaced.modules.protocol.note') }}</div>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.protocol.healthTitle') }}</h2>
        <span class="ix-sub">GET /api/protocol/health</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.protocol.healthLead') }}
      </p>
      <IxState :loading="health.loading" :reason="health.reason" :message="health.message" endpoint="/api/protocol/health">
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
        </div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.protocol.unreachableList') }}</h2>
      </div>
      <div class="ix-tags">
        <span v-for="p in unreachable" :key="p" class="ix-tag">{{ p }}</span>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * svc-protocol (§17.4) — and the clearest example of why this surface reports
 * reachability rather than intent.
 *
 * The service is healthy and svc-edge routes `/api/protocol`. Its router is
 * written, typed and tested. But `src/index.ts` builds `appRouter`, builds the
 * edge context, and never calls `app.register(fastifyTRPCPlugin, ...)` — so the
 * only routes it serves are `/health` and `/ready`. Every procedure listed
 * below returns 404 from Fastify, not from tRPC, which is why the client
 * classifies this module as "router not mounted" and not as an auth problem.
 *
 * The health readout is real: it is the one endpoint that answers. The list
 * beside it is what exists in the source and cannot be called from a browser.
 * It is spelled out so nobody reads a green health tick as a working module.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { plain } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxProtocol',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      health: this.emptySection(),
      // Read off services/svc-protocol/src/router.ts. Not aspirational — these
      // are implemented and unreachable, which is a different problem from
      // unimplemented and worth naming differently.
      unreachable: [
        'predictAddress',
        'buildDeployment',
        'buildSessionGrant',
        'buildSessionRevoke',
        'buildRevokeAllSessions',
        'sessionStatus',
        'checkSessionCall',
        'sessionSpecHash',
        'relayUserOperation',
        'bindingMessage',
        'claimAccount',
        'myAccounts'
      ]
    };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('health', plain('protocol', '/health', this.ixToken));
  }
};
</script>
