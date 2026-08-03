<template>
  <div class="ix-honest-state" :class="'is-' + kind" :role="kind === 'error' ? 'alert' : 'status'">
    <p v-if="kind === 'loading'" class="ix-empty-loading">{{ message || $t('shellResidual.loading') }}</p>
    <p v-else-if="kind === 'error'" class="ix-empty ix-empty-error" role="alert" tabindex="-1">{{ message }}</p>
    <p v-else-if="kind === 'empty'" class="ix-empty">{{ message || $t('shellResidual.nothingYet') }}</p>
    <p v-else-if="kind === 'note'" class="ix-empty" role="note">{{ message }}</p>
    <p v-else-if="kind === 'unknown'" class="ix-dim">{{ message || $t('shellResidual.unknown') }}</p>
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
