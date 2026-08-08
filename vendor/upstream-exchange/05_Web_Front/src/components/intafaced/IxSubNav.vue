<template>
  <nav class="ix-subnav" :aria-label="$t(labelKey)">
    <router-link
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="ix-subnav-item"
      :class="{ 'is-current': item.to === $route.path }"
      :aria-current="item.to === $route.path ? 'page' : false"
    >{{ $t(item.labelKey) }}</router-link>
  </nav>
</template>

<script>
/**
 * The tab strip across the top of a deep module vertical.
 *
 * WHY IT IS NOT `router-link-active`. vue-router marks a parent path active on
 * every child, so `/bank` would light up while the reader is on `/bank/loans` —
 * two tabs claiming to be the current one. The comparison here is against the
 * exact path, so exactly one tab is ever current, and `aria-current="page"`
 * says the same thing to a screen reader that the underline says to an eye.
 *
 * It renders keys, never words. The rows come from config/ix-nav.js so the
 * strip is identical on every screen of the vertical and cannot drift.
 */
export default {
  name: 'IxSubNav',
  props: {
    /** Rows from config/ix-nav.js: { to, labelKey }. */
    items: { type: Array, required: true },
    /** Translation key for the landmark's accessible name. */
    labelKey: { type: String, required: true }
  }
};
</script>
