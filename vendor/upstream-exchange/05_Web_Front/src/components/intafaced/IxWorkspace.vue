<template>
  <div class="ix-workspace" :class="{ 'is-ready': showContent }" :data-state="showContent ? 'ready' : loading ? 'loading' : 'unavailable'">
    <details v-if="showContent && failures.length" class="ix-workspace-partial ix-workspace-details">
      <summary>Some workspace data is unavailable</summary>
      <dl>
        <template v-for="entry in failures">
          <dt :key="entry.name + '-name'">{{ entry.name }}</dt>
          <dd :key="entry.name + '-state'">{{ $t('intafaced.reason.' + entry.section.reason + '.title') }}<span v-if="entry.section.message"> · {{ entry.section.message }}</span></dd>
        </template>
      </dl>
      <router-link v-if="failures.some(entry => entry.section.reason === 'unauthorized')" to="/login">Log in →</router-link>
    </details>
    <slot v-if="showContent"></slot>
    <section v-else class="ix-workspace-state" aria-live="polite">
      <div class="ix-workspace-marker" aria-hidden="true">—</div>
      <div class="ix-workspace-copy">
        <span class="ix-workspace-caption">{{ label }}</span>
        <h2>{{ loading ? $t('intafaced.state.loading') : headline }}</h2>
        <p>{{ loading ? 'Checking workspace availability.' : explanation }}</p>
        <div class="ix-workspace-actions">
          <router-link v-if="failure && failure.reason === 'unauthorized'" to="/login">Log in <span aria-hidden="true">→</span></router-link>
          <router-link to="/platform">Platform directory <span aria-hidden="true">→</span></router-link>
          <details v-if="!loading" class="ix-workspace-details">
            <summary>Service details</summary>
            <dl>
              <template v-for="(section, name) in sections">
                <dt :key="name + '-name'">{{ name }}</dt>
                <dd :key="name + '-state'">{{ section.reason ? $t('intafaced.reason.' + section.reason + '.title') : $t('intafaced.state.loading') }}<span v-if="section.message"> · {{ section.message }}</span></dd>
              </template>
            </dl>
          </details>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
/** Presentation boundary over existing reads. A successful empty response still
 * opens the real workspace; failures never become zero, empty, or success.
 * Keep partially answered workspaces mounted so an unrelated read cannot hide
 * usable data or an action receipt. All failed reads remain inspectable. */
export default {
  name: 'IxWorkspace',
  props: {
    sections: { type: Object, required: true },
    label: { type: String, default: 'Workspace' }
  },
  data() { return { opened: false }; },
  watch: {
    hasAnswer: { immediate: true, handler(value) { if (value) this.opened = true; } }
  },
  computed: {
    reads() { return Object.keys(this.sections).map(key => this.sections[key]); },
    hasAnswer() { return this.reads.some(section => section.reason === 'ok'); },
    showContent() { return this.opened || this.hasAnswer; },
    failures() { return Object.keys(this.sections).filter(name => this.sections[name].reason && this.sections[name].reason !== 'ok').map(name => ({ name, section: this.sections[name] })); },
    loading() { return this.reads.some(section => section.loading); },
    failure() { return this.reads.find(section => section.reason && section.reason !== 'ok'); },
    headline() {
      const copy = { error: 'Temporarily unavailable', unreachable: 'Connection unavailable', unauthorized: 'Sign in to continue', no_surface: 'Not available yet' };
      return this.failure ? (copy[this.failure.reason] || this.$t('intafaced.reason.' + this.failure.reason + '.title')) : 'Workspace unavailable';
    },
    explanation() {
      if (this.failure && this.failure.reason === 'unauthorized') return 'Your workspace is private. Log in to continue.';
      if (this.failure && this.failure.reason === 'no_surface') return 'This workspace is not available yet. Explore the platform to find another room.';
      return 'Workspace data could not be loaded. Explore another room or return later.';
    }
  }
};
</script>

<style scoped>
.ix-workspace-state { display: flex; gap: 24px; align-items: flex-start; padding: 36px 0; border-top: 1px solid #282828; border-bottom: 1px solid #282828; }
.ix-workspace-marker { display: grid; place-items: center; flex: 0 0 42px; height: 42px; border: 1px solid #383838; color: #929292; font: 18px/1 ui-monospace, Menlo, monospace; }
.ix-workspace-copy { min-width: 0; }
.ix-workspace-caption { font: 10px/1.5 ui-monospace, Menlo, monospace; letter-spacing: .1em; text-transform: uppercase; color: #929292; }
.ix-workspace-copy h2 { margin: 8px 0 10px; color: #dedede; font-size: 22px; font-weight: 500; line-height: 1.3; letter-spacing: -.025em; }
.ix-workspace-copy p { max-width: 480px; color: #929292; font-size: 13px; line-height: 1.6; }
.ix-workspace-actions { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px 28px; margin-top: 18px; }
.ix-workspace-actions a { display: inline-flex; align-items: center; gap: 24px; min-height: 32px; color: #d0d0d0; font-size: 12px; }
.ix-workspace-details { color: #929292; font-size: 11px; }
.ix-workspace-details summary { cursor: pointer; padding: 8px 0; }
.ix-workspace-details dl { margin-top: 8px; max-width: 560px; overflow-wrap: anywhere; }
.ix-workspace-details dt { margin-top: 12px; color: #ccc; }
.ix-workspace-details dd { margin: 4px 0; line-height: 1.6; }
.ix-workspace-partial { margin: 12px 0; padding: 6px 0; border-bottom: 1px solid #282828; }
.ix-workspace-actions a:focus-visible, .ix-workspace-details summary:focus-visible { outline: 2px solid var(--ix-orange); outline-offset: 3px; }
@media (max-width: 600px) {
 .ix-workspace-state { padding: 28px 0; gap: 16px; }
 .ix-workspace-marker { flex-basis: 28px; height: 28px; }
 .ix-workspace-copy h2 { font-size: 20px; }
 .ix-workspace-actions { gap: 6px 20px; }
}
</style>
