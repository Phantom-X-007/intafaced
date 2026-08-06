<template>
  <IxSocketPage
    class="help-page"
    :title="$t('cms.helpDetail.title')"
    :lead="$t('cms.helpDetail.lead')"
    source="no service"
    :missing="$t('cms.helpDetail.missing')"
    :needs="needs"
  >
    <router-link to="/help">
      <Button type="primary" size="small">{{ $t('cms.help.title') }}</Button>
    </router-link>
  </IxSocketPage>
</template>

<script>
/**
 * A SINGLE HELP ARTICLE — §13 socket. See Help.vue.
 *
 * This route matters more than the other two, because the registration form
 * links into it: the privacy-policy link on /register points at
 * `/helpdetail?cate=1&id=35`. That link previously resolved to a spinner against
 * the dead backend. It now resolves to a page saying the document is not
 * published, which is the honest answer and a visible reminder that a
 * registration flow is asking people to agree to something unreadable.
 */
import IxSocketPage from '../../components/intafaced/IxSocketPage.vue';

export default {
  name: 'CmsHelpDetail',
  components: { IxSocketPage },
  computed: {
    needs() {
      return [
        this.$t('cms.helpDetail.need1'),
        this.$t('cms.help.need1')
      ];
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-help');
  }
};
</script>

<style scoped>
.help-page {
  padding-top: 80px;
}
</style>
