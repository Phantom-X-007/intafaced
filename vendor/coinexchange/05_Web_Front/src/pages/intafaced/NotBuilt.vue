<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.' + moduleKey + '.title') }}</h1>
      <p>{{ $t('intafaced.modules.' + moduleKey + '.blurb') }}</p>
      <div class="ix-source">{{ serviceName }} · {{ $t('intafaced.hub.legendAbsent') }}</div>
    </div>

    <div class="ix-note">
      <strong>{{ $t('intafaced.modules.' + moduleKey + '.title') }} — {{ $t('intafaced.hub.legendAbsent') }}</strong>
      <div style="margin-top:8px;">{{ $t('intafaced.modules.' + moduleKey + '.note') }}</div>
      <div style="margin-top:12px;">
        <router-link to="/platform">
          <Button size="small">{{ $t('intafaced.hub.title') }}</Button>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * The screen for a module that has no service.
 *
 * Academy (§8.3) and Launch (§8.4) are specced and unbuilt: there is no
 * `services/svc-academy`, no `services/svc-launch`, no prefix at the edge, and
 * nothing to call. So there is nothing to fetch here and no fetch is faked —
 * the page exists so the module is navigable and its absence is stated, not so
 * the navigation looks complete.
 *
 * One component for both, parameterised from the route, rather than two files
 * that would drift.
 */
import { moduleByKey } from '../../config/intafaced.js';

export default {
  name: 'IxNotBuilt',
  props: {
    moduleKey: { type: String, required: true }
  },
  computed: {
    serviceName() {
      var m = moduleByKey(this.moduleKey);
      return m ? m.service : '';
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
  }
};
</script>
