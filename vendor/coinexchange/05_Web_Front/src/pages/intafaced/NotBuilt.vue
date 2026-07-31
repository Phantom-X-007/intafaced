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
 * Reserved "module not built" shell.
 *
 * Used only for routes that still have no service or no edge prefix. Academy
 * and Launch once lived here; both now have real pages (svc-academy lobbies,
 * protocol launch.status). Keep this component generic so a future absent
 * module can reuse it without re-teaching stale product history.
 *
 * No fetch is faked — navigable honesty, not a finished product screen.
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
