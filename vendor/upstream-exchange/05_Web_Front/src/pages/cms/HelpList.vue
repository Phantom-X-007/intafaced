<template>
  <IxSocketPage
    class="help-page"
    :title="$t('cms.helpList.title')"
    :lead="$t('cms.helpList.lead')"
    source="no service"
    :missing="$t('cms.helpList.missing')"
    :needs="needs"
  >
    <router-link to="/help">
      <Button type="primary" size="small">{{ $t('cms.help.title') }}</Button>
    </router-link>
  </IxSocketPage>
</template>

<script>
/**
 * HELP ARTICLE LIST — §13 socket. See Help.vue for the full reasoning; this
 * route drove `/uc/ancillary/more/help/page` and there is no CMS behind the
 * edge to page through.
 */
import IxSocketPage from '../../components/intafaced/IxSocketPage.vue';

export default {
  name: 'CmsHelpList',
  components: { IxSocketPage },
  computed: {
    needs() {
      return [this.$t('cms.help.need1'), this.$t('cms.help.need3')];
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
