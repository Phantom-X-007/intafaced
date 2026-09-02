<template>
  <div class="ix-route-boundary-host" data-status="ready">
    <h1 id="route-heading" class="ix-route-heading">{{ heading }}</h1>
    <section ref="loading" class="ix-route-boundary" role="status" aria-live="polite" style="display: none;">
      <p class="ix-route-boundary-kicker">Loading page</p>
      <h2>Opening the requested address</h2>
      <code ref="loadingPath"></code>
    </section>
    <section ref="failed" class="ix-route-boundary is-failed" role="alert" style="display: none;">
      <p ref="failureCode" class="ix-route-boundary-kicker"></p>
      <h2>Page could not be loaded</h2>
      <p ref="failureMessage"></p>
      <code ref="failurePath"></code>
      <div class="ix-route-boundary-actions">
        <button type="button" @click="retry">Try again</button>
        <router-link to="/">Go home</router-link>
      </div>
    </section>
  </div>
</template>

<script>
export default {
  name: "RouteBoundary",
  props: {
    heading: { type: String, required: true }
  },
  created() {
    var self = this;
    /* This Vue 2 shell can retain a boundary vnode while an async router-view
       swaps underneath it. The subscription owns only these local refs and
       uses textContent, so route truth still paints without HTML injection. */
    this.unsubscribeBoundary = this.$store.subscribe(function (mutation, state) {
      if (mutation.type === "routeLoading" || mutation.type === "routeReady" || mutation.type === "routeFailed") {
        self.applyBoundary(state.routeBoundary);
      }
    });
  },
  mounted() {
    this.applyBoundary(this.$store.state.routeBoundary);
  },
  beforeDestroy() {
    if (this.unsubscribeBoundary) this.unsubscribeBoundary();
    this.unsubscribeBoundary = null;
  },
  methods: {
    applyBoundary(boundary) {
      if (!this.$el || !this.$refs.loading || !this.$refs.failed) return;
      var state = boundary || { status: "ready", path: "/", code: "", message: "" };
      this.$el.setAttribute("data-status", state.status);
      this.$refs.loading.style.display = state.status === "loading" ? "flex" : "none";
      this.$refs.failed.style.display = state.status === "failed" ? "flex" : "none";
      this.$refs.loadingPath.textContent = state.path || "/";
      this.$refs.failureCode.textContent = state.code || "";
      this.$refs.failureMessage.textContent = state.message || "";
      this.$refs.failurePath.textContent = state.path || "/";
    },
    retry() {
      window.location.reload();
    }
  }
};
</script>

<style scoped>
.ix-route-boundary {
  min-height: 52vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 72px 24px;
  text-align: center;
  color: #e8eaed;
  background: #050608;
}
.ix-route-boundary h2,
.ix-route-boundary p { margin: 0; }
.ix-route-boundary-kicker,
.ix-route-boundary code { color: #9aa0a6; }
.ix-route-boundary code {
  max-width: 100%;
  padding: 5px 8px;
  overflow-wrap: anywhere;
  background: #141414;
  border: 1px solid #2a2a2a;
}
.ix-route-boundary.is-failed { border-top: 1px solid #3a3a3a; }
.ix-route-boundary-actions { display: flex; gap: 12px; margin-top: 8px; }
.ix-route-boundary-actions button,
.ix-route-boundary-actions a {
  min-height: 44px;
  padding: 0 18px;
  display: inline-flex;
  align-items: center;
  border: 1px solid #c8c8c8;
  color: #e8eaed;
  background: transparent;
}
</style>
