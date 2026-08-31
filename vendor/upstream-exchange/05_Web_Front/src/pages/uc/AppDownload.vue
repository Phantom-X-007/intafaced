<!--
  /app — Capacitor wrap of this desk.

  Sideload / WebView from this repo. Bundle id app.intafaced.mobile.
  No vendor APK, no vendor QR, no store listing.
-->
<template>
  <div class="ix-page bank-page public-page">
    <div class="ix-page-head">
      <h1>{{ $t('uc.app.title') }}</h1>
      <p>{{ $t('uc.app.lead') }}</p>
      <details class="bank-details"><summary>Details</summary><code>{{ $t('uc.app.source') }}</code></details>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('uc.app.wrapTitle') }}</h2>
        <span class="ix-sub">{{ bundleId }}</span>
      </div>
      <p class="ix-lead">{{ $t('uc.app.wrapBody') }}</p>
      <div class="ix-kv">
        <div class="ix-kv-item">
          <span class="k">{{ $t('uc.app.bundleLabel') }}</span>
          <span class="v ix-bundle">{{ bundleId }}</span>
        </div>
        <div class="ix-kv-item">
          <span class="k">{{ $t('uc.app.buildLabel') }}</span>
          <span class="v">{{ $t('uc.app.buildValue') }}</span>
        </div>
      </div>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('uc.app.sideloadTitle') }}</h2>
      </div>
      <p class="ix-lead">{{ $t('uc.app.sideloadBody') }}</p>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('uc.app.webviewTitle') }}</h2>
      </div>
      <p class="ix-lead">{{ $t('uc.app.webviewBody') }}</p>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('uc.app.storeTitle') }}</h2>
      </div>
      <p class="ix-lead">{{ $t('uc.app.storeBody') }}</p>
      <p class="ix-lead">{{ $t('uc.app.noVendor') }}</p>
    </div>
  </div>
</template>

<script>
/**
 * /app tells the truth: a Capacitor wrap lives in this repo under apps/mobile.
 * It is a WebView of this desk, sideloaded. It is not a store listing and it
 * is not a vendor APK/QR.
 */
export default {
  name: 'UcAppDownload',
  data() {
    return {
      bundleId: 'app.intafaced.mobile'
    };
  },
  created() {
    this.$store.commit('navigate', 'nav-other');
  }
};
</script>

<style scoped>
.ix-lead {
  margin: 0 0 16px;
  color: var(--ix-text-dim);
  font-size: 14px;
  line-height: 1.6;
}
.ix-bundle {
  color: var(--ix-orange);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 16px;
}
</style>
