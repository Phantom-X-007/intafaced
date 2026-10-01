<template>
  <IxSocketPage
    class="help-page public-page"
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
 * This route used to be the target of the sign-up form's user-agreement link
 * (`/helpdetail?cate=1&id=35`). That link resolved to a spinner against a dead
 * backend, then to a page saying the document is not published. Sign-up no
 * longer links here and no longer asks people to agree to an unreadable
 * document. The page still says the article is unpublished, because the
 * content service is still absent.
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
