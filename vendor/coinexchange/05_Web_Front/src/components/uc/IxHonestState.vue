<template>
  <div class="ix-honest-state" :class="'is-' + kind" :role="kind === 'error' ? 'alert' : 'status'">
    <p v-if="kind === 'loading'" class="ix-empty-loading">{{ message || 'Loading…' }}</p>
    <p v-else-if="kind === 'error'" class="ix-empty ix-empty-error">{{ message }}</p>
    <p v-else-if="kind === 'empty'" class="ix-empty">{{ message || 'Nothing here yet' }}</p>
    <p v-else-if="kind === 'note'" class="ix-empty" role="note">{{ message }}</p>
    <p v-else-if="kind === 'unknown'" class="ix-dim">{{ message || '— unknown' }}</p>
  </div>
</template>
<script>
/**
 * Shared honesty dialect for uc money surfaces (Wave A1′).
 * Vocabulary (REASON words) — failed fetch ≠ empty ≠ zero.
 *
 * kind: loading | error | empty | note | unknown
 */
export default {
  name: 'IxHonestState',
  props: {
    kind: {
      type: String,
      required: true,
      validator: function (v) {
        return ['loading', 'error', 'empty', 'note', 'unknown'].indexOf(v) !== -1;
      }
    },
    message: {
      type: String,
      default: ''
    }
  }
};
</script>
<style scoped>
.ix-honest-state {
  margin: 0;
}
.ix-honest-state p {
  margin: 0;
  padding: 4px 0 8px;
}
</style>
