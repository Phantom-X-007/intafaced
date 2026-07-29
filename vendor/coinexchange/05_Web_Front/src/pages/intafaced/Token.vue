<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.token.title') }}</h1>
      <p>{{ $t('intafaced.modules.token.blurb') }}</p>
      <div class="ix-source">svc-token · /api/token/trpc</div>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.modules.token.title') }}</h2>
        <span class="ix-sub">accessOf</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.token.lead') }}
      </p>

      <div v-if="!userId" class="ix-note">
        <strong>{{ $t('intafaced.reason.unauthorized.title') }}</strong>
        <div style="margin-top:6px;">{{ $t('intafaced.reason.unauthorized.body') }}</div>
        <div style="margin-top:12px;">
          <router-link to="/platform">
            <Button type="primary" size="small">{{ $t('intafaced.state.goSignIn') }}</Button>
          </router-link>
        </div>
      </div>

      <IxState v-else :loading="access.loading" :reason="access.reason" :message="access.message" endpoint="/api/token/trpc/accessOf">
        <div v-if="access.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.token.staked') }}</span>
            <span class="v">{{ access.data.staked }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.token.tier') }}</span>
            <span class="v">{{ access.data.tier }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.token.feeDiscount') }}</span>
            <span class="v">{{ access.data.feeDiscountBps }} {{ $t('intafaced.token.bps') }}</span>
          </div>
        </div>
      </IxState>

      <div v-if="tierLooksBroken" class="ix-note" style="margin-top:16px;">
        <strong>{{ $t('intafaced.token.tier') }}</strong>
        <div style="margin-top:6px;">{{ $t('intafaced.token.tierBug') }}</div>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * svc-token (§4.3).
 *
 * `accessOf` takes a userId rather than reading it from the principal, so the
 * screen reads its own `sub` claim out of the access token. Without a session
 * there is no id to send and the call is not made at all — asking the service
 * about a user we cannot name would only produce a confusing 400.
 *
 * NOTE ON `tier`. The service answers `"[object Object]"` because its router
 * does `String(access.tier)` over an object. It is shown exactly as received,
 * with the reason stated beside it. Formatting it into something plausible here
 * would hide a service bug behind a nice-looking screen — which is the specific
 * failure this whole surface is meant not to commit.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query, subjectOf } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxToken',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return { access: this.emptySection() };
  },
  computed: {
    userId() {
      return subjectOf(this.ixToken);
    },
    tierLooksBroken() {
      return !!(this.access.data && this.access.data.tier === '[object Object]');
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    if (this.userId) {
      this.load('access', query('token', 'accessOf', { userId: this.userId }, this.ixToken));
    }
  }
};
</script>
