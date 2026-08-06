<template>
  <div>
    <div v-if="loading" class="ix-note ix-note-quiet">
      <Spin size="small" style="margin-right:8px;display:inline-block;"></Spin>
      {{ $t('intafaced.state.loading') }} <code>{{ endpoint }}</code>
    </div>

    <div v-else-if="reason && reason !== 'ok'" class="ix-note" :class="{ 'ix-note-socket': reason === 'no_surface' }">
      <strong>{{ headline }}</strong>
      <div style="margin-top:6px;">{{ explanation }}</div>
      <div v-if="message" style="margin-top:8px;color:var(--ix-text-faint);">
        <template v-if="reason === 'no_surface'">{{ $t('intafaced.state.whatIsMissing') }} {{ message }}</template>
        <template v-else>{{ $t('intafaced.state.serviceSaid') }} “{{ message }}”</template>
      </div>
      <div v-if="endpoint" style="margin-top:8px;">
        <code>{{ endpoint }}</code>
      </div>
      <div v-if="reason === 'unauthorized'" style="margin-top:12px;">
        <router-link to="/platform">
          <Button type="primary" size="small">{{ $t('intafaced.state.goSignIn') }}</Button>
        </router-link>
      </div>
    </div>

    <slot v-else></slot>
  </div>
</template>

<style scoped>
/**
 * A §13 socket is not an error, and must not be dressed as one. Orange rule on
 * the left says "stated absence"; the red error styling says "something went
 * wrong", and the difference is the entire point of the reason vocabulary.
 */
.ix-note-socket {
  border-left: 3px solid var(--ix-orange, #ff8a1f);
}
</style>

<script>
/**
 * The one place a screen is allowed to have nothing to show.
 *
 * Every failure the client can classify gets its own sentence, because the
 * differences are the whole point: "sign in" is something the reader can fix,
 * "this scope is issued to nobody" is an engineering gap in svc-identity, and
 * "the router was never mounted" is an engineering gap in the service itself.
 * A single grey "no data" would hide all three and let an unfinished screen
 * pass for a finished one.
 */
export default {
  name: 'IxState',
  props: {
    /** A REASON value from config/intafaced.js. Absent or 'ok' renders the slot. */
    reason: { type: String, default: null },
    /** Verbatim text from the service. Never paraphrased. */
    message: { type: String, default: '' },
    /** The path that was actually called. */
    endpoint: { type: String, default: '' },
    loading: { type: Boolean, default: false }
  },
  computed: {
    headline() {
      return this.$t('intafaced.reason.' + this.reason + '.title');
    },
    explanation() {
      return this.$t('intafaced.reason.' + this.reason + '.body');
    }
  }
};
</script>
