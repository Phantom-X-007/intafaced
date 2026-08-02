<template>
  <IxSocketPage
    class="help-page"
    :title="$t('cms.help.title')"
    :lead="$t('cms.help.lead')"
    source="no service"
    :missing="$t('cms.help.missing')"
    :needs="needs"
  />
</template>

<script>
/**
 * HELP AND SUPPORT — a §13 socket covering both, because neither exists.
 *
 * Two separate capabilities sat behind this screen and its children, and both
 * are absent behind our edge:
 *
 * 1. HELP ARTICLES. `/uc/ancillary/more/help`, `/help/page`, `/help/page/top`
 *    and `/help/detail` served a Java-backed article tree with categories, a
 *    "top" list and per-article detail. There is no CMS service, so there are no
 *    articles, no categories and no search.
 *
 * 2. SUPPORT CONTACT. The shell's header links a support channel and the OTC
 *    desk advertised "24/7 support on every trade" (removed — see Main.vue).
 *    There is no support desk, no ticketing surface, and no messaging service
 *    behind the edge. svc-notify sends one-way notifications to a user; it
 *    cannot receive anything from one.
 *
 * The distinction matters for whoever reads this next: help content is a CMS
 * gap, support contact is an inbound-channel gap, and building one gives you
 * nothing towards the other. `needs` states both.
 *
 * NOT STUBBED. A hardcoded FAQ would be inventing platform policy — answers about
 * fees, limits, verification and dispute handling are commitments, and writing
 * plausible ones into a Vue file is how a product acquires terms nobody agreed.
 */
import IxSocketPage from '../../components/intafaced/IxSocketPage.vue';

export default {
  name: 'CmsHelp',
  components: { IxSocketPage },
  computed: {
    needs() {
      return [
        this.$t('cms.help.need1'),
        this.$t('cms.help.need2'),
        this.$t('cms.help.need3')
      ];
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-help');
    this.$store.state.HeaderActiveName = '1-2';
  }
};
</script>

<style scoped>
.help-page {
  padding-top: 80px;
}
</style>
