<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ title }}</h1>
      <p>{{ lead }}</p>
      <div class="ix-source">{{ source }}</div>
    </div>

    <div class="ix-card">
      <IxState reason="no_surface" :message="missing" />

      <div v-if="needs && needs.length" class="ix-needs">
        <div class="ix-needs-head">{{ $t('intafaced.socket.needs') }}</div>
        <ul>
          <li v-for="(n, i) in needs" :key="i">{{ n }}</li>
        </ul>
      </div>

      <div v-if="$slots.default" class="ix-socket-extra">
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * A WHOLE SCREEN THAT IS A §13 SOCKET.
 *
 * The vendored shell arrived with 74 screens. Some of them front capabilities
 * the platform has genuinely not built — there is no CMS service, no support
 * chat service, no password-reset procedure. Those screens have three possible
 * fates and only one of them is acceptable:
 *
 *   1. Leave them pointing at the dead Java backend. With nothing listening the
 *      request never settles, so the screen renders as a permanent spinner. A
 *      hang reads as "slow", not as "absent", which is the most dishonest
 *      outcome available.
 *   2. Stub a plausible response. This invents content, and the whole point of
 *      the honesty rules is that a half-built system must not look finished.
 *   3. Say what is missing. This component.
 *
 * `missing` states the engineering fact — what does not exist. `needs` lists
 * what would have to be built, so the screen doubles as the work item and
 * nobody has to rediscover the gap by clicking into it.
 */
import IxState from './IxState.vue';

export default {
  name: 'IxSocketPage',
  components: { IxState },
  props: {
    /** Screen title — what the reader thought they were opening. */
    title: { type: String, required: true },
    /** One line on what this screen is for. */
    lead: { type: String, default: '' },
    /** Where it used to point, or where it would point. Shown as provenance. */
    source: { type: String, default: '' },
    /** The absence, stated plainly. Rendered under "What is missing:". */
    missing: { type: String, required: true },
    /** What would have to exist. @type {string[]} */
    needs: { type: Array, default: function () { return []; } }
  }
};
</script>

<style scoped>
.ix-needs {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--ix-hairline, rgba(255, 255, 255, 0.09));
}
.ix-needs-head {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ix-text-faint, #6b7280);
  margin-bottom: 10px;
}
.ix-needs ul {
  margin: 0;
  padding-left: 18px;
}
.ix-needs li {
  color: var(--ix-text-dim, #8a909c);
  font-size: 13.5px;
  line-height: 1.7;
}
.ix-socket-extra {
  margin-top: 18px;
}
</style>
