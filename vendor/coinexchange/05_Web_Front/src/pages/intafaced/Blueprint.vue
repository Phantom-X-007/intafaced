<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.blueprint.title') }}</h1>
      <p>{{ $t('intafaced.modules.blueprint.blurb') }}</p>
      <div class="ix-source">svc-blueprint · /api/blueprint/trpc</div>
    </div>

    <div class="ix-note" style="margin-bottom:20px;">
      <strong>{{ $t('intafaced.modules.blueprint.title') }}</strong>
      <div style="margin-top:6px;">{{ $t('intafaced.modules.blueprint.note') }}</div>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.modules.blueprint.title') }}</h2>
        <span class="ix-sub">me</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.blueprint.lead') }}
      </p>
      <IxState :loading="me.loading" :reason="me.reason" :message="me.message" endpoint="/api/blueprint/trpc/me">
        <div v-if="me.data" class="ix-scroll">
          <pre class="ix-pre">{{ pretty }}</pre>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * svc-blueprint (§7.1).
 *
 * `me` is the caller's own profile and returns null when they have not
 * onboarded — so "empty" and "refused" are genuinely different answers here,
 * and the screen keeps them apart.
 *
 * Today it is always refused: `blueprint:read` is not in the scope list
 * svc-identity issues, so there is no session in the platform that can read a
 * Blueprint. The onboarding mutation is not drawn for the same reason
 * `blueprint:write` is not issued either, and a form that could only 403 would
 * misrepresent how close this is.
 *
 * The profile is rendered as the JSON the service returned rather than
 * re-labelled into pretty fields, because §7.2 makes portability the point: what
 * the user sees should be what they would get if they exported it.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxBlueprint',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return { me: this.emptySection() };
  },
  computed: {
    pretty() {
      try {
        return JSON.stringify(this.me.data, null, 2);
      } catch (e) {
        return '';
      }
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('me', query('blueprint', 'me', undefined, this.ixToken));
  }
};
</script>
