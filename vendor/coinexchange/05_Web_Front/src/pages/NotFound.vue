<!--
  The catch-all screen.

  It exists because of what the catch-all used to be: the home page. Any address
  this app does not serve — a typo, a bookmark to a route we removed, a link from
  an old document — rendered a complete, working, correct-looking front page. The
  URL bar still said /whatever, and nothing anywhere said the address was wrong.

  That is not a cosmetic problem. It is why the state of this route table was
  unknowable: /uc/blc, /tradingcenter/coin1buy and /tradeInfo all "worked", and
  so did every route that genuinely worked, and the two were indistinguishable
  from the outside.

  The page names the address it was given, because "404" without the address is
  useless to whoever has to find the bad link. It offers the desk and the home
  page and nothing else — it does not guess what was meant, and it does not
  redirect, because a redirect would hide the broken link all over again.
-->
<template>
  <div class="ix-notfound">
    <div class="ix-notfound-panel" role="alert" aria-live="polite">
      <p class="ix-notfound-code">404</p>
      <h1 class="ix-notfound-title">This address is not one of ours</h1>
      <p class="ix-notfound-body">
        Nothing on INTAFACED is served at
        <code class="ix-notfound-path">{{ attempted }}</code
        >. If you followed a link from inside the product, that link is wrong —
        it is worth reporting rather than working around.
      </p>
      <div class="ix-notfound-actions">
        <router-link to="/" class="ix-notfound-btn is-primary">Home</router-link>
        <router-link to="/exchange" class="ix-notfound-btn">Exchange desk</router-link>
        <router-link to="/platform" class="ix-notfound-btn">Platform</router-link>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'NotFound',
  computed: {
    /**
     * The path as typed, not the matched route.
     *
     * `$route.path` is already normalised, and `fullPath` keeps the query and
     * hash — which is usually where the evidence is when a generated link is
     * malformed.
     */
    attempted() {
      return (this.$route && this.$route.fullPath) || '/';
    }
  },
  created() {
    // Clears the header highlight AND sets the tab title — App.vue's `activeNav`
    // watcher owns document.title for every route, so setting it here directly
    // would be overwritten on the next flush.
    this.$store.commit('navigate', 'nav-notfound');
  }
};
</script>

<style lang="scss" scoped>
.ix-notfound {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 140px 20px 80px;
}
.ix-notfound-panel {
  max-width: 620px;
  width: 100%;
  text-align: center;
  background: #0a0c10;
  border: 1px solid #1a1e26;
  border-radius: 8px;
  padding: 48px 40px;
}
.ix-notfound-code {
  font-size: 56px;
  line-height: 1;
  font-weight: 600;
  color: #00c2a8;
  margin: 0 0 12px;
}
.ix-notfound-title {
  font-size: 22px;
  font-weight: 500;
  color: #e8eaed;
  margin: 0 0 16px;
}
.ix-notfound-body {
  font-size: 14px;
  line-height: 1.7;
  color: #8a8a8a;
  margin: 0 0 28px;
}
.ix-notfound-path {
  display: inline-block;
  max-width: 100%;
  overflow-wrap: anywhere;
  padding: 2px 6px;
  border-radius: 3px;
  background: #141414;
  color: #e8eaed;
  font-size: 13px;
}
.ix-notfound-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}
.ix-notfound-btn {
  display: inline-block;
  padding: 0 18px;
  height: 36px;
  line-height: 34px;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  font-size: 13px;
  color: #bdc2ca;
  text-decoration: none;
  &:hover {
    color: #fff;
    border-color: #00c2a8;
  }
  &.is-primary {
    background: #00c2a8;
    border-color: #00c2a8;
    color: #fff;
  }
}
</style>
