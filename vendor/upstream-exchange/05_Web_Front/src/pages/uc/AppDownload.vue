<!--
  /app — mobile app.

  What this page used to be, and why none of it survived:

    * "Latest version: v1.0.0" and "Released: 2019/08/08 12:32:00" were
      hardcoded defaults, painted before the version endpoint answered and left
      standing when it failed. Both are the upstream vendor's, not ours.
    * Five feature panes illustrated with /static/2019/download1..5.png — a
      directory this repo does not contain, so every one of them 404'd.
    * A Download button pointing at /static/appdownload/INTAFACED-release.apk,
      which has never existed here.
    * A WeChat-browser sniffer that swapped in /static/2019/appdowncover.png
      (also missing) telling the reader to open the page in another browser.

  There is no INTAFACED mobile app today. The route stays so that existing links
  resolve, and it now says the one true thing it can say. When there is a build,
  this page reads its version and its download URL from the version endpoint —
  it does not carry either as a literal again.
-->
<template>
  <IxSocketPage
    :title="$t('uc.app.socketTitle')"
    :lead="$t('uc.app.socketLead')"
    source="no service · no release artefact"
    :missing="$t('uc.app.socketMissing')"
    :needs="needs"
  />
</template>

<script>
/**
 * MOBILE APP DOWNLOAD — a §13 socket, and the clearest invented-content case in
 * this half of the shell.
 *
 * What the screen did before:
 *
 * - Rendered "Latest version: v1.0.0" and "Released: 2019/08/08 12:32:00" from
 *   HARDCODED component defaults. Those are not placeholders a service later
 *   overwrites in practice — the call that would have overwritten them,
 *   `/uc/ancillary/system/app/version/0`, goes to the dead Java backend, so the
 *   invented pair is exactly what every visitor saw.
 * - Offered a download button pointing at `/static/appdownload/*.apk`. There is
 *   no `static/appdownload` directory in this project and no APK anywhere in
 *   the repository. The button produced a 404.
 *
 * So the page asserted a version number, a release date and a shipping Android
 * build, and all three were fiction. There is no mobile app, no release
 * pipeline, and no service that could report a version. It says so.
 */
import IxSocketPage from '../../components/intafaced/IxSocketPage.vue';

export default {
  name: 'UcAppDownload',
  components: { IxSocketPage },
  computed: {
    needs() {
      return [
        this.$t('uc.app.need1'),
        this.$t('uc.app.need2')
      ];
    }
  },
  created() {
    window.document.title = this.$t('shellResidual.titleApp');
    this.$store.commit('navigate', 'nav-other');
  }
};
</script>
